import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.client import Gemini
from app.ai.guard import numbers, validate_output
from app.ai.news_pipeline import deduplicate
from app.ai.schemas import Analysis, NewsDigest
from app.config import settings
from app.core.cache import cache
from app.main import app, requests


def analysis():
    return Analysis(summary=[{'text': 'Hiệu quả vốn cần được xem cùng ngành.', 'evidence': ['roe']}]*5,
                    strengths=[], weaknesses=[], risks=[])


def test_guard_rejects_unsupported_numbers_evidence_and_promises():
    output = analysis()
    validate_output(output, {'roe': .2}, {'roe'})
    for bad in ['ROE đạt 99.', 'chắc chắn tăng']:
        output.summary[0].text = bad
        with pytest.raises(ValueError):
            validate_output(output, {'roe': .2}, {'roe'})
    output.summary[0].text = 'Hiệu quả vốn.'
    output.summary[0].evidence = ['invented']
    with pytest.raises(ValueError):
        validate_output(output, {'roe': .2}, {'roe'})


def test_guard_reads_localized_source_numbers_without_accepting_new_output_numbers():
    assert numbers('1.863,41 điểm và 13,3%', source_locale=True) == [1863.41, 13.3]
    assert numbers('1,863.41', source_locale=True) == [1863.41]
    output = analysis()
    output.summary[0].text = 'Chỉ số là 1863.41.'
    validate_output(output, {'source_text': 'Chỉ số 1.863,41 điểm'}, {'roe'})
    output.summary[0].text = 'Chỉ số là 9999.'
    with pytest.raises(ValueError):
        validate_output(output, {'source_text': 'Chỉ số 1.863,41 điểm'}, {'roe'})


@pytest.mark.parametrize('mode', ['429', '500', 'invalid_schema', 'timeout'])
async def test_gemini_fallback(mode, monkeypatch):
    cache.items.clear()
    monkeypatch.setattr(settings, 'gemini_api_key', 'fake-test-key')
    monkeypatch.setattr(settings, 'gemini_model_chain', 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite')
    models = []
    async def handler(request):
        models.append(request.url.path)
        if 'flash-lite' not in request.url.path:
            if mode == 'timeout':
                raise httpx.ReadTimeout('test timeout')
            if mode == 'invalid_schema':
                return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': '{}'}]}}]})
            return httpx.Response(int(mode), json={'error': 'test'})
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': analysis().model_dump_json()}]}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await Gemini(client).generate({'roe': .2}, Analysis, {'roe'}, 'analysis')
    assert result['available'] and result['fallback']
    assert result['model_used'] == 'gemini-3.5-flash-lite'
    assert models[0].endswith('gemini-3.8-flash:generateContent')
    assert len([m for m in models if 'flash-lite' not in m]) == (2 if mode in ('429','timeout') else 4)


def test_news_word_count_and_deduplication():
    with pytest.raises(ValueError):
        NewsDigest(context='ngắn',key_developments='ngắn',key_figures='ngắn',impact='ngắn',watch_next='ngắn',sentiment='neutral',evidence=['url'])
    row={'headline':'Doanh nghiệp công bố kết quả', 'published_at':'2026-10-14T00:00:00+07:00','sources':[{'name':'a'}]}
    merged=deduplicate([row,{**row,'sources':[{'name':'b'}]}])
    assert len(merged)==1 and len(merged[0]['sources'])==2


async def test_ai_queue_wait_does_not_consume_generation_budget(monkeypatch):
    cache.items.clear()
    monkeypatch.setattr(settings,'gemini_api_key','test')
    monkeypatch.setattr(settings,'gemini_model_chain','gemini-3.8-flash')
    async def handler(request):
        return httpx.Response(200,json={'candidates':[{'content':{'parts':[{'text':analysis().model_dump_json()}]}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gemini=Gemini(client)
        gemini.limit=asyncio.Semaphore(0)
        task=asyncio.create_task(gemini.generate({'roe':.2},Analysis,{'roe'},'analysis',budget=.02))
        await asyncio.sleep(.04)
        gemini.limit.release()
        result=await task
    assert result['available']


async def test_comparison_retries_english_output_in_vietnamese_and_has_time_to_generate(monkeypatch):
    cache.items.clear()
    monkeypatch.setattr(settings,'gemini_api_key','test')
    monkeypatch.setattr(settings,'gemini_model_chain','gemini-3.8-flash')
    calls=[]
    async def handler(request):
        calls.append(request)
        assert request.extensions['timeout']['read']==25
        value=analysis()
        if len(calls)==1:
            value.summary[0].text='MBB has the highest return on equity.'
        return httpx.Response(200,json={'candidates':[{'content':{'parts':[{'text':value.model_dump_json()}]}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result=await Gemini(client).generate({'roe':.2},Analysis,{'roe'},'compare')
    assert result['available'] and len(calls)==2
    assert result['attempts'][0]['status']=='non_vietnamese'


def test_health_and_invalid_input_do_not_need_network():
    requests.clear()
    with TestClient(app) as client:
        assert client.get('/health').status_code == 200
        assert client.get('/api/health').json()['data']['name'] == 'FinScope'
        assert client.get('/api/company/VNM.VN/overview').status_code == 422
        assert client.get('/api/compare?tickers=VNM').status_code == 422
        assert client.get('/api/company/VNM/prices?range=bad').json()['error']['code'] == 'validation_error'
