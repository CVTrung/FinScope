import asyncio
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher

from app.ai.client import Gemini
from app.ai.research_sources import enrich_article
from app.ai.schemas import MonthlyDigest, NewsDigest
from app.fusion.normalize import source_date, text
from app.models import Meta, Response, now


def clean_snippet(value: str, headline: str) -> str:
    value = ' '.join(text(value).split())
    headline = ' '.join(headline.split())
    boilerplate = 'Báo lỗi bài viết Địa chỉ email Họ tên Số điện thoại Nội dung'
    for _ in range(4):
        before = value
        if value.startswith(boilerplate):
            value = value[len(boilerplate):].strip()
        if headline and value.startswith(headline):
            value = value[len(headline):].strip()
        if value == before:
            break
    return value


def deduplicate(rows: list[dict]) -> list[dict]:
    output: list[dict] = []
    for row in rows:
        norm = re.sub(r'\W+', ' ', row['headline'].lower()).strip()
        duplicate = False
        for old in output:
            old_norm = re.sub(r'\W+', ' ', old['headline'].lower()).strip()
            delta = abs((datetime.fromisoformat(row['published_at'])-datetime.fromisoformat(old['published_at'])).total_seconds())
            if delta <= 86400 and SequenceMatcher(None, norm, old_norm).ratio() >= .85:
                old['sources'] += [s for s in row['sources'] if s not in old['sources']]
                duplicate = True
                break
        if not duplicate:
            output.append(row)
    return output


async def news(service, ticker: str, days: int, source: str) -> Response:
    if source not in ('auto', 'simplize'):
        return Response(data={'items': []}, meta=Meta(warnings=['Tin tức nguồn này chưa được xác minh.']))
    raw, status = await service.attempt('simplize', service.simplize.fetch(
        f'/api/company/news-event/list?ticker={ticker}&isWl=false&page=1&size=15'))
    rows = []
    cutoff = datetime.fromisoformat(now()) - timedelta(days=days)
    for r in raw or []:
        published = source_date(r.get('createdDate'))
        if not published or datetime.fromisoformat(published) < cutoff:
            continue
        excerpt = clean_snippet(r.get('description') or '', r['title'])
        rows.append({'id': r['id'], 'ticker': ticker, 'headline': r['title'], 'published_at': published,
                     'description': excerpt, 'source_excerpt': excerpt,
                     'image_url': r.get('thumbUrl') or r.get('imageUrl'),
                     'content_level': 'snippet', 'summary': None, 'supplementary': False,
                     'sources': [{'name': 'simplize', 'publisher': r.get('sourceNameDisplay'),
                                  'url': f'https://simplize.vn/co-phieu/{ticker}/tin-tuc', 'type': 'primary',
                                  'note': 'Trang danh sách nguồn; liên kết bài gốc chưa được endpoint cung cấp.'}]})
    rows = await asyncio.gather(*(enrich_article(service, row) for row in deduplicate(rows)))
    return Response(data={'items': list(rows), 'monthly_digest': None,
                          'note': 'AI tự tổng hợp và đánh giá ảnh hưởng từ nội dung tin. Mở bài gốc để đối chiếu; ảnh và nội dung được dẫn qua Simplize.'},
                    meta=Meta(sources_status={'simplize': status}))


async def summarize(service, ticker: str, news_id: str) -> Response:
    listing = await news(service, ticker, 90, 'auto')
    row = next((r for r in listing.data['items'] if r['id'] == news_id), None)
    if not row:
        return Response(data={'available': False, 'reason': 'Không tìm thấy tin trong 90 ngày.'}, meta=listing.meta)
    facts = {'headline': row['headline'], 'content': row.get('content') or row['source_excerpt'],
             'content_level': row['content_level'], 'source_url': row['sources'][0]['url']}
    result = await Gemini(service.http.client).generate(facts, NewsDigest, {facts['source_url']}, 'news')
    return Response(data={**result, 'article': row}, meta=listing.meta)


async def monthly(service, ticker: str) -> Response:
    listing = await news(service, ticker, 30, 'auto')
    events = await service.events(ticker, 'auto')
    cutoff = (datetime.fromisoformat(now()) - timedelta(days=30)).isoformat()
    current_events = [r for r in events.data['items'] if r.get('date') and cutoff <= r['date'] <= now()]
    if not listing.data['items'] and not current_events:
        return Response(data={'available': False, 'reason': 'Chưa có tin hoặc công bố trong 30 ngày.'}, meta=listing.meta)
    references = {}
    articles = []
    for i, row in enumerate(listing.data['items']):
        key = f'tin_{i}'
        references[key] = row['sources'][0]['url']
        articles.append({'headline': row['headline'], 'published_at': row['published_at'],
                         'content': (row.get('content') or row['description'])[:2000], 'evidence_key': key})
    event_facts = []
    for i, row in enumerate(current_events[:10]):
        key = f'su_kien_{i}'
        if row.get('url'):
            references[key] = row['url']
            event_facts.append({**row, 'evidence_key': key})
    facts = {'ticker': ticker, 'articles': articles, 'events': event_facts}
    result = await Gemini(service.http.client).generate(facts, MonthlyDigest, set(references), 'monthly')
    if result.get('available'):
        result = {**result, 'result': {**result['result'],
                  'evidence': [references[key] for key in result['result']['evidence']]}}
    return Response(data=result, meta=listing.meta)
