from datetime import datetime, timedelta

import pytest

from app.ai.guard import validate_vietnamese
from app.ai.schemas import Analysis, MonthlyDigest
from app.analytics.broker_reports import merge_reports
from app.models import Meta, Response, now


def test_comparison_rejects_english_prose_but_keeps_evidence_keys():
    value = Analysis(summary=[{'text':'MBB có hiệu quả vốn cao hơn trong nhóm.', 'evidence':['MBB.roe']}]*5,
                     strengths=[], weaknesses=[], risks=[])
    validate_vietnamese(value)
    value.summary[0].text = 'MBB has the highest return on equity.'
    with pytest.raises(ValueError, match='Vietnamese'):
        validate_vietnamese(value)


def test_short_outlook_is_structured_without_forcing_a_long_news_digest():
    value = MonthlyDigest(sections=[{'title':'Chiều hướng doanh nghiệp', 'bullets':['Tăng trưởng cần được đối chiếu với diễn biến dòng tiền. '*4]}], evidence=['url'])
    assert len(value.sections)==1
    with pytest.raises(ValueError):
        MonthlyDigest(sections=[{'title':'Tin','bullets':['quá ngắn']}],evidence=['url'])


def report(url, days, target=None):
    return {'title':'Quan điểm CTCK', 'source':'CTCK A', 'attachedLink':url,
            'issueDate':(datetime.fromisoformat(now())-timedelta(days=days)).isoformat(),
            'targetPrice':target}


def test_broker_views_include_old_and_no_target_but_remove_duplicates_and_future():
    rows=merge_reports([report('https://example.org/a.pdf',30,100)],
                        [report('https://example.org/a.pdf',30,100),report('https://example.org/b.pdf',300),
                         report('https://example.org/c.pdf',-3,900)])
    assert len(rows)==2
    assert rows[0]['targetPrice']==100 and not rows[0]['historical']
    assert rows[1]['targetPrice'] is None and rows[1]['historical']


def test_broker_reports_reject_bad_dates_and_non_web_links():
    assert merge_reports([{'issueDate':'bad','attachedLink':'https://example.org/a.pdf'},
                          report('javascript:alert(1)',10,999)])==[]


async def test_outlook_facts_keep_company_context_and_exclude_future_events(monkeypatch):
    from app.ai import news_pipeline
    from app.ai.client import Gemini
    async def listing(*args):
        return Response(data={'items':[]},meta=Meta())
    async def generate(self,facts,*args,**kwargs):
        assert facts['ticker']=='VNM'
        assert len(facts['events'])==1
        assert facts['events'][0]['title']=='Đã công bố'
        return {'available':True, 'result':{'sections':[], 'evidence':list(args[1])}}
    class Service:
        http=type('HTTP',(),{'client':None})()
        async def events(self,*args):
            today=datetime.fromisoformat(now())
            return Response(data={'items':[
                {'title':'Đã công bố','date':(today-timedelta(days=2)).isoformat(),'url':'https://example.org/a'},
                {'title':'Chưa xảy ra','date':(today+timedelta(days=2)).isoformat(),'url':'https://example.org/b'}]},meta=Meta())
    monkeypatch.setattr(news_pipeline,'news',listing)
    monkeypatch.setattr(Gemini,'generate',generate)
    result=await news_pipeline.monthly(Service(),'VNM')
    assert result.data['available']
    assert result.data['result']['evidence']==['https://example.org/a']
