from datetime import datetime
from urllib.parse import urlparse

from app.fusion.normalize import source_date, text
from app.models import now


def merge_reports(*batches: list[dict]) -> list[dict]:
    today = datetime.fromisoformat(now())
    merged: dict[str, dict] = {}
    for rows in batches:
        for row in rows:
            url = row.get('attachedLink')
            if not url or urlparse(url).scheme not in ('https', 'http'):
                continue
            published = source_date(row.get('issueDate'))
            try:
                date = datetime.fromisoformat(published) if published else None
            except ValueError:
                continue
            if not date:
                continue
            if date.tzinfo is None:
                date = date.replace(tzinfo=today.tzinfo)
            if date > today:
                continue
            target = row.get('targetPrice')
            item = {**row, 'title': text(row.get('title')), 'source': text(row.get('source')) or 'Chưa nêu CTCK',
                    'targetPrice': target if isinstance(target, (int, float)) and target > 0 else None,
                    'recommend': text(row.get('recommend')), 'published_at': date.isoformat(),
                    'historical': (today-date).days > 180}
            if url not in merged or item['published_at'] > merged[url]['published_at']:
                merged[url] = item
    return sorted(merged.values(), key=lambda row: row['published_at'], reverse=True)
