from datetime import datetime, timedelta

import pytest

from app.ai.news_pipeline import clean_snippet, news
from app.ai.schemas import MonthlyDigest
from app.analytics.recommendations import summarize_reports
from app.models import now
from app.services import FinanceService


def report(broker, target, days=10):
    return {'source': broker, 'targetPrice': target,
            'issueDate': (datetime.fromisoformat(now()) - timedelta(days=days)).isoformat()}


def test_targets_use_latest_per_broker_and_recent_consensus():
    result = summarize_reports([report('A', 120), report('A', 999, 20), report('B', 160),
                                report('C', 800, 100), report('D', 900, -5)], 100)
    assert result['target_price'] == 140
    assert result['broker_count'] == 2
    assert result['upside'] == pytest.approx(.4)


def test_target_missing_single_source_old_and_invalid_dates():
    result = summarize_reports([report('A', 120), report('B', 150, 181),
                                {'source': 'C', 'targetPrice': 999, 'issueDate': 'bad'}], None)
    assert result['coverage'] == 'single_source'
    assert result['target_price'] == 120 and result['upside'] is None
    assert summarize_reports([], 100)['target_price'] is None


def test_monthly_requires_readable_sections_and_word_limit():
    value = MonthlyDigest(sections=[{'title': 'Kinh doanh', 'bullets': ['nội dung ' * 110]}], evidence=['url'])
    assert len(value.sections) == 1
    with pytest.raises(ValueError):
        MonthlyDigest(sections=[{'title': 'Tin', 'bullets': ['quá ngắn']}], evidence=['url'])
    with pytest.raises(ValueError):
        MonthlyDigest(text='nội dung ' * 110, evidence=['url'])


def test_source_excerpt_removes_repeated_headline_and_report_form():
    value = 'Tiêu đề Báo lỗi bài viết Địa chỉ email Họ tên Số điện thoại Nội dung Tiêu đề Nội dung tin.'
    assert clean_snippet(value, 'Tiêu đề') == 'Nội dung tin.'


class Source:
    async def fetch(self, path):
        return [{'id': 'a', 'title': 'Tin công bố', 'createdDate': now(),
                 'description': '<p>Mô tả nguồn</p>', 'thumbUrl': 'https://example.org/photo.jpg'}]

    async def fetch_page(self, ticker):
        return {'companyNews': [{'title': 'Sự kiện', 'createdDate': now(),
                                'content': '<b>Nội dung công bố</b>', 'recordDate': '15/10/2026'}]}


class Service:
    simplize = Source()

    async def attempt(self, name, action):
        return await action, 'ok'


async def test_news_image_and_event_excerpt_remain_source_based():
    service = Service()
    result = await news(service, 'VNM', 90, 'auto')
    assert result.data['items'][0]['image_url'] == 'https://example.org/photo.jpg'
    assert result.data['items'][0]['description'] == 'Mô tả nguồn'
    events = await FinanceService.events(service, 'VNM', 'auto')
    row = events.data['items'][0]
    assert row['summary'] == 'Nội dung công bố'
    assert row['image_url'] is None
    assert row['dates']['Ngày đăng ký cuối'].startswith('2026-10-15')
