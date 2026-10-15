import asyncio
import hashlib
import json
import logging
import random
from pathlib import Path
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.ai.guard import validate_output, validate_vietnamese
from app.config import settings
from app.core.cache import cache

T = TypeVar('T', bound=BaseModel)
FREE_MODELS = {'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
               'gemini-2.5-flash', 'gemini-2.5-flash-lite'}
AI_LIMIT = asyncio.Semaphore(2)
log = logging.getLogger('finscope')


class Gemini:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self.limit = AI_LIMIT

    async def generate(self, facts: dict, schema: type[T], evidence: set[str], prompt_name: str, budget: float | None = None,
                       documents: list[dict] | None = None) -> dict:
        if not settings.gemini_api_key:
            return {'available': False, 'reason': 'Chưa cấu hình GEMINI_API_KEY hoặc GOOGLE_API_KEY.', 'attempts': []}
        prompt = (Path(__file__).parent / 'prompts' / (prompt_name+'.md')).read_text(encoding='utf-8')
        payload_text = prompt+'\nEVIDENCE: '+json.dumps(sorted(evidence))+'\nFACTS: '+json.dumps(facts, ensure_ascii=False, allow_nan=False)
        doc_key = hashlib.sha256(json.dumps(documents or [], sort_keys=True).encode()).hexdigest()
        key = 'ai:'+hashlib.sha256((settings.gemini_model_chain+schema.__name__+payload_text+doc_key).encode()).hexdigest()
        async def run():
            attempts = []
            retry_hint = ''
            for index, model in enumerate(settings.gemini_model_chain.split(',')):
                model = model.strip()
                if model not in FREE_MODELS:
                    attempts.append({'model': model, 'status': 'not_in_verified_free_allowlist'})
                    continue
                for retry in range(2):
                    try:
                        config = {'responseMimeType': 'application/json',
                                  'responseJsonSchema': schema.model_json_schema(),
                                  'maxOutputTokens': 4096 if prompt_name in ('compare', 'monthly') else 10000}
                        if model.startswith('gemini-3'):
                            config['thinkingConfig'] = {'thinkingLevel': 'low'}
                        else:
                            config.update({'temperature': .15, 'thinkingConfig': {'thinkingBudget': 0}})
                        r = await self.client.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                            headers={'x-goog-api-key': settings.gemini_api_key},
                            json={'contents': [{'parts': [{'text': payload_text + retry_hint}, *(documents or [])]}],
                                  'generationConfig': config},
                            timeout=min(25 if prompt_name in ('compare', 'monthly') else 12, settings.ai_timeout_seconds))
                        if r.status_code in (429, 503):
                            attempts.append({'model': model, 'status': 'quota_429' if r.status_code == 429 else 'http_503'})
                            break
                        if r.status_code in (400, 401, 403, 404):
                            message = r.json().get('error', {}).get('message', '')
                            if 'API key not valid' in message:
                                return {'available': False, 'reason': 'Khóa Gemini trong .env không hợp lệ. Cập nhật GEMINI_API_KEY hoặc GOOGLE_API_KEY rồi khởi động lại API.',
                                        'attempts': attempts + [{'model': model, 'status': 'invalid_api_key'}]}
                            attempts.append({'model': model, 'status': f'http_{r.status_code}'})
                            break
                        r.raise_for_status()
                        parts = r.json()['candidates'][0]['content']['parts']
                        output = schema.model_validate_json(''.join(p.get('text', '') for p in parts if not p.get('thought')))
                        validate_output(output, facts, evidence)
                        if prompt_name == 'compare':
                            validate_vietnamese(output)
                        return {'available': True, 'result': output.model_dump(), 'model_used': model,
                                'fallback': index > 0, 'attempts': attempts, 'prompt_version': prompt.splitlines()[0]}
                    except (httpx.HTTPError, ValueError, KeyError, IndexError, ValidationError) as exc:
                        # Never log exception URLs or payloads; these may contain credentials.
                        categories = {'Unknown AI evidence': 'unknown_evidence',
                                      'Comparison prose must be Vietnamese': 'non_vietnamese',
                                      'Unsupported number in AI output': 'unsupported_number',
                                      'Absolute investment recommendation': 'absolute_recommendation',
                                      'Ambiguous numeric format in AI output': 'ambiguous_number'}
                        category = f'http_{exc.response.status_code}' if isinstance(exc, httpx.HTTPStatusError) else categories.get(str(exc), type(exc).__name__) if isinstance(exc, ValueError) else type(exc).__name__
                        attempts.append({'model': model, 'status': category})
                        log.warning('ai_fallback', extra={'model_used': model, 'status': category})
                        numeric_hint = 'Không viết chữ số trong diễn giải.' if prompt_name in ('analysis', 'compare') else 'Chỉ sao chép số đã có trong FACTS, không làm tròn hoặc tự tính số mới.'
                        retry_hint = '\nLần trước không đạt kiểm tra. Mọi câu diễn giải phải bằng tiếng Việt có dấu; chỉ giữ nguyên mã chứng khoán và mã evidence. Trả JSON đúng schema. ' + numeric_hint + ' Chỉ chọn evidence từ EVIDENCE. Giữ đủ số nhận định/phần và số từ schema yêu cầu.'
                        if isinstance(exc, httpx.TimeoutException):
                            break
                        if retry == 0:
                            await asyncio.sleep(.5 + random.random()*.3)
            return {'available': False, 'reason': 'Gemini chưa khả dụng hoặc đầu ra không qua kiểm tra dữ kiện.', 'attempts': attempts}
        async def timed():
            try:
                async with self.limit:
                    async with asyncio.timeout(budget or settings.ai_timeout_seconds):
                        return await run()
            except TimeoutError:
                return {'available': False, 'reason': 'Gemini vượt thời gian xử lý cho phép.',
                        'attempts': [{'model': 'chain', 'status': 'timeout'}]}
        result, hit = await cache.get(key, timed, 21600)
        # Failed quota calls have a shorter negative cache to avoid hammering the provider.
        if not result.get('available') and not hit:
            cache.items.pop(key, None)
            async def failed():
                return result
            await cache.get(key, failed, 15 if prompt_name == 'reviews' else 120)
        return {**result, 'cache_hit': hit}

