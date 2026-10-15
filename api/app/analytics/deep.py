import math
from itertools import pairwise
from statistics import stdev

from app.analytics.ratios import LABELS


def price_risk(items: list[dict]) -> dict:
    closes = [p['close'] for p in items if isinstance(p.get('close'), (float, int)) and p['close'] > 0]
    if len(closes) < 2:
        return {'return': None, 'volatility': None, 'max_drawdown': None, 'observations': len(closes)}
    changes = [math.log(b/a) for a, b in pairwise(closes)]
    peak, drawdown = closes[0], 0.0
    for price in closes:
        peak = max(peak, price)
        drawdown = min(drawdown, price/peak-1)
    return {'return': closes[-1]/closes[0]-1, 'volatility': stdev(changes)*math.sqrt(252) if len(changes)>1 else None,
            'max_drawdown': drawdown, 'observations': len(closes)}


def ratio_changes(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        current, prior = row['current']['value'], row['year_ago']
        if isinstance(current, (float, int)) and isinstance(prior, (float, int)) and prior != 0:
            result.append({'key': row['key'], 'label': row['label'], 'unit': row['current']['unit'],
                           'current': current, 'year_ago': prior, 'change': (current-prior)/abs(prior)})
    return sorted(result, key=lambda r: abs(r['change']), reverse=True)


def scenarios(values: dict) -> list[dict]:
    metric = 'pe' if (values.get('eps') or 0) > 0 and (values.get('pe') or 0) > 0 else 'pb'
    base = values.get('eps' if metric == 'pe' else 'bvps')
    multiple = values.get(metric)
    if not base or not multiple or base <= 0 or multiple <= 0:
        return []
    return [{'name': name, 'multiple': multiple*factor, 'metric': LABELS[metric][0], 'value': base*multiple*factor,
             'assumption': 'Giữ nguyên EPS TTM / BVPS; chỉ thay multiple. Chưa điều chỉnh các sự kiện sau kỳ báo cáo.'}
            for name, factor in [('Multiple giảm 20%', .8), ('Multiple hiện tại', 1), ('Multiple tăng 20%', 1.2)]]
