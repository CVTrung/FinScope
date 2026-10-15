from datetime import datetime, timedelta
from statistics import median

from app.fusion.normalize import source_date
from app.models import now


def summarize_reports(reports: list[dict], price: float | None) -> dict:
    """One latest report per broker, so frequent publishers cannot dominate."""
    today = datetime.fromisoformat(now())
    latest: dict[str, dict] = {}
    for report in reports:
        published = source_date(report.get('issueDate'))
        target = report.get('targetPrice')
        if not published or not isinstance(target, (int, float)) or target <= 0:
            continue
        try:
            date = datetime.fromisoformat(published)
        except ValueError:
            continue
        if date.tzinfo is None:
            date = date.replace(tzinfo=today.tzinfo)
        published = date.isoformat()
        broker = report.get('source')
        if not broker or not today - timedelta(days=180) <= date <= today:
            continue
        row = {**report, 'published_at': published}
        if broker not in latest or published > latest[broker]['published_at']:
            latest[broker] = row
    rows = sorted(latest.values(), key=lambda r: r['published_at'], reverse=True)
    recent = [r for r in rows if datetime.fromisoformat(r['published_at']) >= today - timedelta(days=90)]
    selected = recent if len(recent) >= 2 else rows
    target = median(r['targetPrice'] for r in selected) if selected else None
    return {'target_price': target, 'upside': target / price - 1 if target and price and price > 0 else None,
            'broker_count': len(selected), 'reports': selected,
            'method': 'Trung vị giá mục tiêu: báo cáo mới nhất mỗi CTCK, ưu tiên 90 ngày khi có ít nhất 2 nguồn; nếu không dùng tối đa 180 ngày.',
            'coverage': 'single_source' if len(selected) == 1 else 'multiple_sources' if selected else 'unavailable'}
