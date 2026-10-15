import asyncio
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response as BinaryResponse
from fastapi.responses import StreamingResponse

from app.ai.client import Gemini
from app.ai.news_pipeline import monthly, news, summarize
from app.ai.schemas import Analysis
from app.analytics.scoring import score
from app.analytics.watchlist_flags import flags
from app.core.http import SourceError
from app.models import Meta, Response

router = APIRouter(prefix='/api')
Source = Literal['auto', 'vietstock', 'simplize', 'yahoo']
Period = Literal['quarter', 'year']


def service(request: Request):
    return request.app.state.finance


def symbol(ticker: str) -> str:
    ticker = ticker.upper().strip()
    if not re.fullmatch(r'[A-Z][A-Z0-9]{1,7}', ticker):
        raise HTTPException(422, 'Mã Việt Nam không hợp lệ; không nhập hậu tố .VN hoặc mã quốc tế.')
    return ticker


@router.get('/health', response_model=Response)
async def health():
    return Response(data={'status': 'ok', 'name': 'FinScope', 'version': '1.0.0'}, meta=Meta())


@router.get('/sources/status', response_model=Response)
async def sources(request: Request):
    return Response(data=service(request).http.status, meta=Meta())


@router.get('/search', response_model=Response)
async def search(request: Request, q: str = Query(min_length=1, max_length=80)):
    rows, status = await service(request).attempt('simplize', service(request).simplize.search(q.strip()))
    if rows is None:
        raise HTTPException(503, 'Nguồn tìm kiếm chưa khả dụng.')
    return Response(data=[{'ticker': r['ticker'], 'name': r['name'], 'exchange': r.get('stockExchange')}
                          for r in rows if r.get('type') == 'stock' and r.get('stockExchange') in ('HOSE', 'HNX', 'UPCOM', 'UPCoM')],
                    meta=Meta(sources_status={'simplize': status}))


@router.get('/company/{ticker}/overview', response_model=Response)
async def overview(request: Request, ticker: str, source: Source = 'auto'):
    return await service(request).overview(symbol(ticker), source)


@router.get('/company/{ticker}/prices', response_model=Response)
async def prices(request: Request, ticker: str, range: Literal['1mo', '3mo', '6mo', '1y', '5y'] = '1y',
                 interval: Literal['1d'] = '1d', source: Source = 'auto'):
    return await service(request).prices(symbol(ticker), range, source)


@router.get('/company/{ticker}/financials', response_model=Response)
async def financials(request: Request, ticker: str, period: Period = 'quarter',
                     statement: Literal['is', 'bs', 'cf'] = 'is', source: Source = 'auto'):
    return await service(request).financials(symbol(ticker), period, statement, source)


@router.get('/company/{ticker}/ratios', response_model=Response)
async def ratios(request: Request, ticker: str, period: Period = 'quarter', source: Source = 'auto'):
    return await service(request).ratios(symbol(ticker), period, source)


@router.get('/industry/{ticker}', response_model=Response)
async def industry(request: Request, ticker: str, source: Source = 'auto'):
    return await service(request).industry(symbol(ticker), source)


@router.get('/company/{ticker}/valuation', response_model=Response)
async def valuation(request: Request, ticker: str, source: Source = 'auto'):
    return await service(request).valuation(symbol(ticker), source)


@router.get('/company/{ticker}/reports', response_model=Response)
async def company_reports(request: Request, ticker: str, page: int = Query(1, ge=1, le=100), source: Source = 'auto'):
    return await service(request).broker_reports(symbol(ticker), page, source)


@router.get('/company/{ticker}/zones', response_model=Response)
async def zones(request: Request, ticker: str, source: Source = 'auto'):
    result = await service(request).valuation(symbol(ticker), source)
    return Response(data=result.data['zones'], meta=result.meta)


@router.get('/company/{ticker}/ownership', response_model=Response)
async def ownership(request: Request, ticker: str, source: Source = 'auto'):
    return await service(request).ownership(symbol(ticker), source)


@router.get('/company/{ticker}/events', response_model=Response)
async def events(request: Request, ticker: str, source: Source = 'auto'):
    return await service(request).events(symbol(ticker), source)


@router.get('/company/{ticker}/events/{event_id}/preview')
async def event_preview(request: Request, ticker: str, event_id: str):
    from app.ai.document_preview import document_preview
    listing = await service(request).events(symbol(ticker), 'auto')
    event = next((r for r in listing.data['items'] if r['id'] == event_id), None)
    image = await document_preview(service(request), event.get('url') or '') if event else None
    if not image:
        raise HTTPException(404, 'Sự kiện chưa có ảnh hoặc tài liệu PDF xem trước.')
    return BinaryResponse(content=image, media_type='image/png', headers={'Cache-Control': 'public, max-age=900'})


@router.get('/company/{ticker}/news', response_model=Response)
async def company_news(request: Request, ticker: str, days: int = Query(90, ge=1, le=90), source: Source = 'auto'):
    return await news(service(request), symbol(ticker), days, source)


@router.get('/company/{ticker}/news/{news_id}/summary', response_model=Response)
async def news_summary(request: Request, ticker: str, news_id: str):
    return await summarize(service(request), symbol(ticker), news_id)


@router.get('/company/{ticker}/news-digest', response_model=Response)
async def news_digest(request: Request, ticker: str):
    return await monthly(service(request), symbol(ticker))


@router.get('/company/{ticker}/news-reviews', response_model=Response)
async def news_reviews(request: Request, ticker: str):
    from app.ai.research_sources import review_items
    listing = await news(service(request), symbol(ticker), 90, 'auto')
    if not listing.data['items']:
        return Response(data={'available': False, 'reason': 'Chưa có tin để đánh giá.'}, meta=listing.meta)
    return Response(data=await review_items(service(request), listing.data['items'], 'news'), meta=listing.meta)


@router.get('/company/{ticker}/event-reviews', response_model=Response)
async def event_reviews(request: Request, ticker: str, offset: int = Query(0, ge=0, le=200), kind: Literal['all', 'dividend', 'disclosure'] = 'all'):
    from app.ai.research_sources import review_items
    listing = await service(request).events(symbol(ticker), 'auto')
    items = [r for r in listing.data['items'] if kind == 'all' or r['type'] == kind][offset:offset+6]
    if not items:
        return Response(data={'available': False, 'reason': 'Chưa có sự kiện để đánh giá.'}, meta=listing.meta)
    return Response(data=await review_items(service(request), items, 'events'), meta=listing.meta)


@router.get('/company/{ticker}/analysis')
async def analysis(request: Request, ticker: str, source: Source = 'auto'):
    ticker = symbol(ticker)
    async def run():
        finance = service(request)
        ratio, value = await asyncio.gather(finance.ratios(ticker, 'quarter', source), finance.valuation(ticker, source))
        sector = ratio.data['industry']
        peers = [p for p in sector.get('peers', []) if p.get('period') == ratio.data['period']]
        scoring = score(ratio.data['values'], peers)
        watch = flags(ratio.data['values'])
        facts = {'ticker': ticker, 'ratios': ratio.data['values'], 'industry': sector.get('statistics', {}),
                 'scoring': scoring, 'zones': value.data['zones'], 'watch_points': watch}
        from app.analytics.ratios import LABELS
        facts['formatted_ratios'] = {k: (f'{v*100:.2f}%' if LABELS[k][1] == 'ratio' else f'{v:.2f}')
                                     for k, v in ratio.data['values'].items() if v is not None}
        evidence = {k for k, v in ratio.data['values'].items() if v is not None}
        ai = await Gemini(finance.http.client).generate(facts, Analysis, evidence, 'analysis') if evidence else {
            'available': False, 'reason': 'Chưa đủ dữ kiện để phân tích AI.'}
        return Response(data={'ai': ai, 'scoring': scoring, 'zones': value.data['zones'], 'watch_points': watch,
                              'industry': sector, 'ratios': ratio.data['rows']}, meta=ratio.meta)
    if 'text/event-stream' in request.headers.get('accept', ''):
        async def stream():
            yield 'event: progress\ndata: {"stage":"Đang tổng hợp số liệu và phân tích Gemini"}\n\n'
            try:
                async with asyncio.timeout(110):
                    result = await run()
                yield 'event: result\ndata: '+result.model_dump_json()+'\n\n'
            except (SourceError, ValueError, TypeError, KeyError, TimeoutError) as exc:
                import logging
                logging.getLogger('finscope').warning('analysis_stream_error', extra={'status': type(exc).__name__})
                yield 'event: error\ndata: {"message":"Phân tích chưa khả dụng. Vui lòng thử lại."}\n\n'
        return StreamingResponse(stream(), media_type='text/event-stream')
    return await run()


@router.get('/company/{ticker}/score', response_model=Response)
async def company_score(request: Request, ticker: str, source: Source = 'auto'):
    result = await service(request).ratios(symbol(ticker), 'quarter', source)
    peers = [p for p in result.data['industry'].get('peers', []) if p.get('period') == result.data['period']]
    return Response(data=score(result.data['values'], peers), meta=result.meta)


@router.get('/company/{ticker}/deep-analysis', response_model=Response)
async def company_deep_analysis(request: Request, ticker: str, question: str = Query('Đánh giá chất lượng tăng trưởng, dòng tiền và rủi ro định giá.', max_length=600), source: Source = 'auto'):
    from app.ai.deep_analysis import deep_analysis
    return await deep_analysis(service(request), symbol(ticker), question, source)


@router.get('/compare', response_model=Response)
async def compare(request: Request, tickers: str, source: Source = 'auto'):
    symbols = list(dict.fromkeys(symbol(t) for t in tickers.split(',')))
    if not 2 <= len(symbols) <= 5:
        raise HTTPException(422, 'Chọn từ 2 đến 5 mã khác nhau.')
    finance = service(request)
    async def one(t):
        try:
            ov, ra, pr = await asyncio.gather(finance.overview(t, source), finance.ratios(t, 'quarter', source), finance.prices(t, '1y', source))
            from app.analytics.recommendations import summarize_reports
            recommendation = summarize_reports([], None)
            try:
                valuation = await finance.valuation(t, source)
                recommendation = summarize_reports(valuation.data['reports'], ov.data['kpis']['price']['value'])
            except (SourceError, ValueError, TypeError, KeyError):
                ra.meta.warnings.append('Chưa lấy được báo cáo giá mục tiêu; vẫn hiển thị hệ số và giá.')
            return {'ticker': t, 'overview': ov.data, 'ratios': ra.data, 'prices': pr.data['items'],
                    'recommendation': recommendation, 'meta': ra.meta.model_dump()}
        except (SourceError, ValueError, TypeError, KeyError) as exc:
            import logging
            logging.getLogger('finscope').warning('compare_partial', extra={'ticker': t, 'status': type(exc).__name__})
            return {'ticker': t, 'error': 'Dữ liệu mã này chưa khả dụng.'}
    companies = await asyncio.gather(*(one(t) for t in symbols))
    groups = {c['overview']['industry_id'] for c in companies if 'overview' in c}
    return Response(data={'companies': companies, 'cross_industry': len(groups) > 1,
                          'warning': 'Các mã khác ngành, multiple không so sánh trực tiếp được.' if len(groups) > 1 else None}, meta=Meta())


@router.get('/market/overview', response_model=Response)
async def market(request: Request):
    finance = service(request)
    async def index(t):
        raw, status = await finance.attempt('simplize', finance.simplize.fetch('/api/company/summary/index/'+t))
        return {'ticker': t, 'value': raw.get('priceClose') if raw else None,
                'change': raw.get('pctChange')/100 if raw and raw.get('pctChange') is not None else None,
                'source': 'simplize', 'period': None, 'status': status,
                'note': 'Thời điểm giao dịch chưa được endpoint công bố.'}
    from app.core.cache import cache
    async def load():
        rows = await asyncio.gather(*(index(t) for t in ['VNINDEX', 'VN30', 'HNXINDEX', 'UPCOMINDEX']))
        return Response(data={'indices': rows}, meta=Meta(sources_status={'simplize': 'ok' if any(r['status'] == 'ok' for r in rows) else 'unavailable'}))
    result, hit = await cache.get('market', load, 90)
    return result.model_copy(update={'meta': result.meta.model_copy(update={'cache_hit': hit})}, deep=True)


@router.get('/compare/analysis', response_model=Response)
async def compare_analysis(request: Request, tickers: str, source: Source = 'auto'):
    result = await compare(request, tickers, source)
    from app.analytics.ratios import LABELS
    labels = {key: value[0] for key, value in LABELS.items()}
    labels.update({'roe': 'Tỷ suất lợi nhuận trên vốn chủ sở hữu (ROE)', 'roa': 'Tỷ suất lợi nhuận trên tài sản (ROA)',
                   'nim': 'Biên lãi thuần (NIM)', 'cir': 'Chi phí trên thu nhập (CIR)', 'npl': 'Tỷ lệ nợ xấu (NPL)',
                   'casa': 'Tiền gửi không kỳ hạn (CASA)', 'llr': 'Bao phủ nợ xấu (LLR)'})
    companies = {c['ticker']: {'ratios': c['ratios']['values'], 'period': c['ratios']['period'],
                              'industry_group': c['ratios']['industry_group']} for c in result.data['companies'] if 'ratios' in c}
    evidence = {f'{ticker}.{key}' for ticker, company in companies.items() for key, value in company['ratios'].items() if value is not None}
    facts = {'companies': companies, 'indicator_labels': labels, 'comparison_warning': result.data['warning']}
    ai = await Gemini(service(request).http.client).generate(facts, Analysis, evidence, 'compare')
    ai['evidence_labels'] = {key: key.split('.')[0]+' · '+labels.get(key.split('.')[1], key.split('.')[1]) for key in evidence}
    return Response(data=ai, meta=result.meta)
