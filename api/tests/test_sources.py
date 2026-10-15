import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.connectors.simplize import Simplize
from app.connectors.vietstock import Vietstock
from app.connectors.yahoo import Yahoo
from app.core.cache import MemoryCache
from app.core.http import NotFound, SourceError, SourceHTTP
from app.fusion.normalize import statements, yahoo_prices
from app.services import FinanceService

FIXTURES = Path(__file__).parent/'fixtures'


def fixture(name):
    return json.loads((FIXTURES/name).read_text(encoding='utf-8'))


async def test_singleflight_and_failed_calls_not_cached():
    cache = MemoryCache()
    calls = 0
    async def action():
        nonlocal calls
        calls += 1
        await asyncio.sleep(.01)
        return 42
    values = await asyncio.gather(*(cache.get('same', action) for _ in range(10)))
    assert calls == 1 and all(v[0] == 42 for v in values)
    assert (await cache.get('same', action))[1]
    async def fail():
        raise ValueError('expected')
    with pytest.raises(ValueError):
        await cache.get('fail', fail)
    assert (await cache.get('fail', action))[0] == 42


async def test_connector_fixtures_and_actual_shape():
    async def handler(request):
        if '/summary/' in request.url.path:
            return httpx.Response(200, json=fixture('simplize-profile.json'))
        if '/fi/' in request.url.path:
            return httpx.Response(200, json=fixture('simplize-ratios.json'))
        return httpx.Response(200, json=fixture('yahoo-prices.json'))
    http = SourceHTTP()
    await http.client.aclose()
    http.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    s = Simplize(http)
    assert (await s.fetch_profile('VNM'))['ticker'] == 'VNM'
    raw = await s.fetch_financials('VNM', 'ratio', 'quarter')
    table = statements(raw, 'is', 'VNM')
    assert table['periods'][0] == 'Q2/2026'
    assert next(r for r in table['rows'] if r['key']=='is1')['values'][0]['value'] == 18847347464988
    y = Yahoo(http)
    prices = yahoo_prices(await y.fetch_prices('VNM'))
    assert len(prices)>100 and all(p['close'] is not None for p in prices)
    await http.client.aclose()


async def test_vietstock_token_exchange_and_normalization():
    seen = []
    async def handler(request):
        seen.append(request)
        if request.method == 'GET':
            return httpx.Response(200, text='<input name=__RequestVerificationToken value="fixture-token">')
        assert b'__RequestVerificationToken=fixture-token' in request.content
        return httpx.Response(200, json=fixture('vietstock-trading.json'))
    http = SourceHTTP()
    await http.client.aclose()

    http.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert (await Vietstock(http).fetch_profile('VNM'))['ClosePrice'] > 0
    assert seen[0].url.path == '/'
    table = FinanceService.vietstock_table(fixture('vietstock-financials.json'), 'is')
    assert table['periods'][0] == 'Q2/2026'
    assert table['rows'][0]['values'][0]['value'] == 18847e9
    await http.client.aclose()


async def test_one_source_blocked_keeps_overview_available():
    from app.core.cache import cache
    cache.items.clear()
    async def handler(request):
        if 'simplize' in request.url.host:
            return httpx.Response(200, json=fixture('simplize-profile.json'))
        return httpx.Response(403)
    http = SourceHTTP()
    await http.client.aclose()
    http.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    overview = await FinanceService(http).overview('VNM')
    assert overview.data['kpis']['price']['value'] > 0
    assert overview.meta.sources_status['vietstock'] == 'blocked_403'
    assert overview.meta.warnings
    await http.client.aclose()


async def test_no_sources_and_unknown_ticker_are_distinct():
    from app.core.cache import cache
    cache.items.clear()
    async def blocked(request):
        return httpx.Response(403)
    http = SourceHTTP()
    await http.client.aclose()
    http.client = httpx.AsyncClient(transport=httpx.MockTransport(blocked))
    with pytest.raises(SourceError):
        await FinanceService(http).overview('VNM')
    await http.client.aclose()
    async def unknown(request):
        if '/suggestions' in request.url.path:
            return httpx.Response(200, json={'status':200,'data':[]})
        return httpx.Response(404)
    http.client = httpx.AsyncClient(transport=httpx.MockTransport(unknown))
    with pytest.raises(NotFound):
        await FinanceService(http).overview('ZZZZZZ')
    await http.client.aclose()
