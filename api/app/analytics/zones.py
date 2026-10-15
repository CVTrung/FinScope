from statistics import mean, median, pstdev
from typing import Any

from app.config import settings


def calculate_zones(price: float | None, eps: float | None, bvps: float | None,
                    pe_history: list[float], pb_history: list[float], targets: list[float],
                    support: float | None = None, resistance: float | None = None) -> dict:
    methods: list[dict[str, Any]] = []
    for name, base, history, weight in [('P/E lịch sử', eps, pe_history, .4), ('P/B lịch sử', bvps, pb_history, .3)]:
        clean = [v for v in history if 0 < v <= 100]
        if base is not None and base > 0 and len(clean) >= 8:
            center, sigma = median(clean), pstdev(clean)
            methods.append({'name': name, 'value': base*center, 'weight': weight, 'samples': len(clean),
                            'low': base*max(0, center-sigma), 'high': base*(center+sigma)})
    if len(targets) >= 2:
        methods.append({'name': 'Đồng thuận CTCK', 'value': median(targets), 'weight': .3, 'samples': len(targets),
                        'low': min(targets), 'high': max(targets)})
    assumptions = ['Vùng mua: 75–85%; vùng giữ: 85–110%; vùng bán: 110–125% giá hợp lý.',
                   'Multiple lịch sử lấy theo quý do nguồn công bố, chưa tái dựng độc lập giá cuối kỳ; không thay bằng multiple hiện tại.',
                   'Định giá mang tính tham khảo học tập; báo cáo CTCK chỉ lấy trong 180 ngày.']
    if not methods:
        return {'available': False, 'methods': [], 'confidence': 'Thấp', 'assumptions': assumptions,
                'note': 'Chưa đủ dữ liệu định giá được xác minh.', 'fair_mid': None}
    mid = sum(m['value']*m['weight'] for m in methods) / sum(m['weight'] for m in methods)
    cv = pstdev([m['value'] for m in methods])/mean(m['value'] for m in methods)
    low, high = mid*settings.buy_low, mid*settings.buy_high
    if support is not None and support <= high:
        low = max(low, support)
    sell_high = max(mid*settings.sell_low, min(mid*settings.sell_high, resistance)) if resistance else mid*settings.sell_high
    confidence = 'Cao' if len(methods) >= 3 and cv < .15 else 'Trung bình' if len(methods) >= 2 and cv <= .30 else 'Thấp'
    return {'available': True, 'fair_mid': mid, 'buy': [low, high], 'hold': [high, mid*settings.sell_low],
            'sell': [mid*settings.sell_low, sell_high], 'methods': methods, 'confidence': confidence,
            'status': 'unknown' if price is None else 'in_buy_zone' if low <= price <= high else
                      'in_sell_zone' if price >= mid*settings.sell_low else 'below_buy_zone' if price < low else 'hold',
            'assumptions': assumptions}
