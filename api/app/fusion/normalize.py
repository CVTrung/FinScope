import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from app.models import DataField

SOURCE_FIELDS = json.loads(Path(__file__).with_name('source_fields.json').read_text(encoding='utf-8'))


def text(value: str | None) -> str:
    return BeautifulSoup(value or '', 'html.parser').get_text(' ', strip=True)


def source_date(value: str | None) -> str | None:
    if not value:
        return None
    dotnet = re.search(r'/Date\((\d+)\)/', value)
    if dotnet:
        return datetime.fromtimestamp(int(dotnet[1])/1000, ZoneInfo('Asia/Ho_Chi_Minh')).isoformat()
    for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y'):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=ZoneInfo('Asia/Ho_Chi_Minh')).isoformat()
        except ValueError:
            continue
    return value


def statements(data: dict[str, Any], statement: str, ticker: str) -> dict[str, Any]:
    industry = data.get('industryGroup', 'MANUFACTURING')
    items = sorted(data.get('items', []), key=lambda x: x['periodDate'], reverse=True)
    rows = []
    for key, definitions in SOURCE_FIELDS.items():
        if not key.startswith(statement):
            continue
        valid = [d for d in definitions if industry in d['industries']]
        if not valid:
            continue
        values = [DataField(field=key, value=item.get(key), period=item['periodDateName'], scope='source_unspecified',
                            chosen_source='simplize', source_url=f'https://simplize.vn/co-phieu/{ticker}/so-lieu-tai-chinh',
                            note='Phạm vi/kiểm toán chưa được endpoint công bố.').model_dump() for item in items]
        rows.append({'key': key, 'label': valid[-1]['label'], 'values': values})
    return {'periods': [i['periodDateName'] for i in items], 'rows': rows, 'industry_group': industry}


def yahoo_prices(raw: dict[str, Any]) -> list[dict[str, Any]]:
    quote = raw.get('indicators', {}).get('quote', [{}])[0]
    prices = []
    for i, stamp in enumerate(raw.get('timestamp', [])):
        row = {k: quote.get(k, [])[i] if len(quote.get(k, [])) > i else None
               for k in ('open', 'high', 'low', 'close', 'volume')}
        if row['close'] is not None:
            prices.append({'date': datetime.fromtimestamp(stamp, ZoneInfo('Asia/Ho_Chi_Minh')).date().isoformat(), **row})
    return prices


def simplize_prices(rows: list) -> list[dict]:
    prices = []
    for row in rows:
        if len(row) < 6 or row[4] is None or row[4] <= 0:
            continue
        prices.append({'date': datetime.fromtimestamp(row[0], ZoneInfo('Asia/Ho_Chi_Minh')).date().isoformat(),
                       'open': row[1], 'high': row[2], 'low': row[3], 'close': row[4], 'volume': row[5]})
    return sorted(prices, key=lambda p: p['date'])
