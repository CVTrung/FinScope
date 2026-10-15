from statistics import mean
from typing import Any

from app.analytics.ratios import LOWER_BETTER

PILLARS = {
    'Sinh lời': (.25, ['roe', 'roa', 'ros']),
    'Tăng trưởng': (.20, ['revenue_growth', 'profit_growth', 'eps_growth']),
    'Hiệu quả': (.15, ['asset_turnover', 'ccc']),
    'Sức khỏe tài chính': (.20, ['current_ratio', 'debt_equity', 'interest_coverage', 'cfo_net_income']),
    'Định giá': (.20, ['pe', 'pb']),
}


def score(ratios: dict, peers: list[dict]) -> dict:
    pillars: list[dict[str, Any]] = []
    strengths: list[dict[str, Any]] = []
    weaknesses: list[dict[str, Any]] = []
    for label, (weight, keys) in PILLARS.items():
        values = []
        for key in keys:
            value = ratios.get(key)
            sample = [p['ratios'][key] for p in peers if p.get('ratios', {}).get(key) is not None]
            if key in ('pe', 'pb'):
                sample = [v for v in sample if 0 < v <= 100]
            if value is None or len(sample) < 3:
                continue
            percentile = 100*(sum(v < value for v in sample) + .5*sum(v == value for v in sample))/len(sample)
            if key in LOWER_BETTER:
                percentile = 100-percentile
            values.append(percentile)
            row = {'indicator': key, 'value': value, 'percentile': percentile, 'peer_count': len(sample)}
            if percentile >= 75:
                strengths.append(row)
            if percentile <= 25:
                weaknesses.append(row)
        pillars.append({'name': label, 'weight': weight, 'value': mean(values) if values else None,
                        'coverage': len(values)/len(keys)})
    active = [p for p in pillars if p['value'] is not None]
    total = sum(p['value']*p['weight'] for p in active)/sum(p['weight'] for p in active) if active else None
    return {'total': total, 'pillars': pillars, 'coverage': sum(p['weight']*p['coverage'] for p in pillars),
            'strengths': strengths, 'weaknesses': weaknesses, 'method': 'Xếp hạng phần trăm peers; bỏ trụ cột thiếu và chuẩn hóa lại trọng số.'}
