from statistics import mean, median, pstdev

from app.analytics.ratios import LABELS


def aggregate(peers: list[dict]) -> dict:
    result = {}
    for key in LABELS:
        values = [p['ratios'][key] for p in peers if p.get('ratios', {}).get(key) is not None]
        if key in ('pe', 'pb', 'ev_ebitda', 'ps'):
            values = [v for v in values if 0 < v <= 100]
        result[key] = {'median': median(values) if values else None, 'mean': mean(values) if values else None,
                       'std': pstdev(values) if len(values) > 1 else None, 'count': len(values)}
    return result
