import asyncio
import base64
from copy import deepcopy
from io import BytesIO
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup, Tag
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.ai.client import Gemini
from app.ai.schemas import ReviewBatch
from app.core.cache import cache
from app.fusion.normalize import text


def public_url(value) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme in ('https', 'http') and parsed.hostname else None


async def enrich_article(service, row: dict) -> dict:
    detail, status = await service.attempt('simplize', service.simplize.fetch('/api/company/news-event/detail/'+row['id']))
    if not isinstance(detail, dict) or not detail:
        return {**row, 'detail_status': status}
    from app.ai.news_pipeline import clean_snippet
    body = clean_snippet(detail.get('content') or detail.get('description') or '', row['headline'])
    original = public_url(detail.get('sourceUrl'))
    image = BeautifulSoup(detail.get('content') or '', 'html.parser').find('img')
    return {**row, 'content': body[:16000], 'content_level': 'article' if body else 'snippet',
            'image_url': detail.get('thumbUrl') or detail.get('imageUrl') or (image.get('src') if isinstance(image, Tag) else None) or row.get('image_url'),
            'sources': [{'name': 'simplize', 'publisher': detail.get('sourceNameDisplay') or detail.get('sourceWebsite'),
                         'url': original or row['sources'][0]['url'], 'type': 'original' if original else 'aggregator',
                         'note': 'Bài gốc do endpoint chi tiết cung cấp; nội dung đọc qua Simplize.' if original else 'Nguồn chưa cung cấp liên kết bài gốc.'}]}


async def document_text(service, url: str) -> tuple[str, str]:
    """Read only verified disclosure CDN PDFs. No arbitrary URL/redirect fetching."""
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'cdn.simplize.vn' or not parsed.path.lower().endswith('.pdf'):
        return '', 'not_supported'
    async def load():
        try:
            async with service.http.client.stream('GET', url, follow_redirects=False, timeout=12) as response:
                response.raise_for_status()
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > 8_000_000:
                        return '', 'too_large'
            if not chunks.startswith(b'%PDF'):
                return '', 'not_pdf'
            def extract():
                reader = PdfReader(BytesIO(chunks))
                return ' '.join((page.extract_text() or '') for page in reader.pages[:12])[:20000]
            result = await asyncio.to_thread(extract)
            return text(result), 'extracted' if len(result.strip()) > 80 else 'scanned_or_empty'
        except (PdfReadError, ValueError, KeyError, OSError) as exc:
            return '', type(exc).__name__
        except httpx.HTTPError:
            return '', 'document_unavailable'
    return (await cache.get('document:'+url, load, 21600))[0]


async def review_items(service, items: list[dict], kind: str) -> dict:
    attachments: dict[str, str] = {}
    async def prepare(row):
        if kind == 'news':
            return {'id': row['id'], 'headline': row['headline'], 'content': row.get('content') or row['description'],
                    'content_level': row['content_level'], 'source_url': row['sources'][0]['url']}
        content, status = await document_text(service, row.get('url') or '')
        if status == 'scanned_or_empty':
            try:
                response = await service.http.client.get(row['url'], follow_redirects=False, timeout=12)
                response.raise_for_status()
                if len(response.content) <= 3_000_000 and response.content.startswith(b'%PDF'):
                    attachments[row['id']] = base64.b64encode(response.content).decode()
                    status = 'pdf_visual_ai'
            except httpx.HTTPError:
                status = 'document_unavailable'
        return {'id': row['id'], 'headline': row['title'], 'content': content or row['summary'],
                'dates': row.get('dates'), 'content_level': status, 'source_url': row.get('url') or 'https://simplize.vn/'}
    facts = await asyncio.gather(*(prepare(row) for row in items))
    for row in facts:
        row['content'] = row['content'][:6000]
        row['evidence_key'] = 'article:'+row['id']
    async def batch(rows):
        documents = []
        for row in rows:
            if row['id'] in attachments:
                documents.extend([{'text': 'Tài liệu PDF cho article id: '+row['id']},
                                  {'inlineData': {'mimeType': 'application/pdf', 'data': attachments[row['id']]}}])
        result = await Gemini(service.http.client).generate({'articles': rows}, ReviewBatch,
                  {r['evidence_key'] for r in rows}, 'reviews', budget=35, documents=documents)
        if result.get('available'):
            expected = {r['id']: r for r in rows}
            reviews = deepcopy(result['result']['items'])
            if len(reviews) != len(expected) or {r['id'] for r in reviews} != set(expected) or any(
                any(key != expected[r['id']]['evidence_key'] for key in r['evidence']) for r in reviews
            ):
                return {'available': False, 'reason': 'AI chưa ghép đúng từng bài với nguồn; vui lòng thử lại.', 'attempts': result.get('attempts')}
            for review in reviews:
                review['evidence'] = [expected[review['id']]['source_url']]
            result = {**result, 'result': {'items': reviews}}
        return result
    results = await asyncio.gather(*(batch(facts[i:i+3]) for i in range(0, len(facts), 3)))
    output = [item for result in results if result.get('available') for item in result['result']['items']]
    missing = len(items)-len(output)
    return {'available': bool(output), 'result': {'items': output},
            'reason': f'Còn {missing} bài chưa được AI đánh giá; có thể thử lại.' if missing else None,
            'model_used': ', '.join(dict.fromkeys(r['model_used'] for r in results if r.get('available'))),
            'attempts': [attempt for r in results for attempt in (r.get('attempts') or [])],
            'documents': [{'id': r['id'], 'content_level': r['content_level']} for r in facts]}
