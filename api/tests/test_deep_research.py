
import httpx
import pytest

from app.ai.research_sources import document_text, enrich_article
from app.analytics.deep import price_risk, scenarios
from app.core.cache import cache
from app.core.http import SourceHTTP
from app.fusion.normalize import simplize_prices
from app.services import FinanceService


def test_price_risk_drawdown_is_peak_to_trough_and_null_is_not_zero():
    result = price_risk([{'close':100},{'close':120},{'close':90},{'close':110}])
    assert result['max_drawdown'] == -.25
    assert result['return'] == pytest.approx(.1)
    assert result['volatility'] > 0
    assert price_risk([])['return'] is None


def test_sensitivity_keeps_earnings_fixed_and_handles_loss():
    rows = scenarios({'pe':10,'eps':2000})
    assert [r['value'] for r in rows] == [16000,20000,24000]
    assert scenarios({'pe':-1,'eps':-100,'pb':2,'bvps':10000})[1]['value'] == 20000
    assert scenarios({}) == []


async def test_fox_falls_back_to_verified_simplize_ohlcv():
    cache.items.clear()
    async def handler(request):
        if 'yahoo' in request.url.host:
            return httpx.Response(404)
        assert request.url.path == '/api/historical/prices/chart'
        return httpx.Response(200,json={'status':200,'data':[[1760486400,62500,62500,61000,61500,129900]]})
    http = SourceHTTP()
    await http.client.aclose()
    http.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    result = await FinanceService(http).prices('FOX','1y','auto')
    assert result.data['source']=='simplize'
    assert result.data['items'][0]['close']==61500
    assert result.data['items'][0]['volume']==129900
    assert result.meta.sources_status['yahoo']=='not_found'
    await http.client.aclose()


def test_missing_price_rows_not_invented():
    assert simplize_prices([[1760486400,1,1,1,None,0]]) == []


async def test_article_detail_supplies_original_link_and_actual_content():
    class Source:
        async def fetch(self,path):
            return {'sourceUrl':'https://example.org/original','sourceNameDisplay':'Báo gốc','content':'<p>Nội dung chi tiết.</p>'}
    class Service:
        simplize=Source()
        async def attempt(self,name,action):
            return await action,'ok'
    result=await enrich_article(Service(),{'id':'abc','headline':'Tin','sources':[{'url':'https://simplize.vn/'}]})
    assert result['sources'][0]['url']=='https://example.org/original'
    assert result['content']=='Nội dung chi tiết.'
    assert result['content_level']=='article'


async def test_pdf_reader_does_not_fetch_untrusted_hosts():
    assert await document_text(None,'https://localhost/secret.pdf') == ('','not_supported')
    assert await document_text(None,'http://cdn.simplize.vn/a.pdf') == ('','not_supported')


async def test_actual_pdf_first_page_renders_as_png():
    from io import BytesIO

    from pypdf import PdfWriter

    from app.ai.document_preview import document_preview, previews
    output = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=600, height=800)
    writer.write(output)
    previews.clear()
    http = SourceHTTP()
    await http.client.aclose()
    http.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200,content=output.getvalue())))
    result = await document_preview(FinanceService(http),'https://cdn.simplize.vn/test.pdf')
    assert result and result.startswith(b'\x89PNG\r\n\x1a\n')
    await http.client.aclose()


async def test_reviews_reject_cross_article_evidence(monkeypatch):
    from app.ai.client import Gemini
    from app.ai.research_sources import review_items
    async def wrong(*args, **kwargs):
        return {'available':True, 'model_used':'test', 'result':{'items':[
            {'id':'a','summary':['Tin A'],'impact':'Tác động','watch_next':'Theo dõi','sentiment':'uncertain','evidence':['article:b']}]}}
    monkeypatch.setattr(Gemini,'generate',wrong)
    class HTTP:
        client=None
    class Service:
        http=HTTP()
    result=await review_items(Service(),[{'id':'a','headline':'Tin','description':'Nội dung','content_level':'snippet',
        'sources':[{'url':'https://example.org/a'}]}],'news')
    assert not result['available']
    assert result['result']['items']==[]


async def test_review_url_mapping_does_not_mutate_cached_model_output(monkeypatch):
    from app.ai.client import Gemini
    from app.ai.research_sources import review_items
    cached={'available':True,'model_used':'test','result':{'items':[
        {'id':'a','summary':['Tin'],'sentiment':'neutral','impact':'Tác động','watch_next':'Theo dõi','evidence':['article:a']}]}}
    async def generate(*args,**kwargs):
        return cached
    monkeypatch.setattr(Gemini,'generate',generate)
    class HTTP:
        client=None
    class Service:
        http=HTTP()
    rows=[{'id':'a','headline':'Tin','description':'Nội dung','content_level':'snippet','sources':[{'url':'https://example.org/a'}]}]
    for _ in range(2):
        result=await review_items(Service(),rows,'news')
        assert result['available']
        assert result['result']['items'][0]['evidence']==['https://example.org/a']
    assert cached['result']['items'][0]['evidence']==['article:a']
