from statistics import mean
from typing import Any


def divide(a: float | None, b: float | None, positive: bool = False) -> float | None:
    if a is None or b is None or b == 0 or (positive and b < 0):
        return None
    return a / b


LABELS = {
    'roe': ('ROE', 'ratio'), 'roa': ('ROA', 'ratio'), 'ros': ('Biên lợi nhuận ròng', 'ratio'),
    'gross_margin': ('Biên lợi nhuận gộp', 'ratio'), 'operating_margin': ('Biên hoạt động', 'ratio'),
    'ebitda_margin': ('Biên EBITDA', 'ratio'), 'asset_turnover': ('Vòng quay tổng tài sản', 'times'),
    'inventory_turnover': ('Vòng quay hàng tồn kho', 'times'), 'receivables_turnover': ('Vòng quay phải thu', 'times'),
    'payables_turnover': ('Vòng quay phải trả', 'times'), 'fixed_asset_turnover': ('Vòng quay TSCĐ', 'times'),
    'dio': ('DIO · Ngày tồn kho', 'days'), 'dso': ('DSO · Ngày thu tiền', 'days'),
    'dpo': ('DPO · Ngày trả tiền', 'days'), 'ccc': ('CCC · Chu kỳ tiền', 'days'),
    'current_ratio': ('Thanh toán hiện hành', 'times'), 'quick_ratio': ('Thanh toán nhanh', 'times'),
    'cash_ratio': ('Thanh toán tiền', 'times'), 'debt_equity': ('Nợ phải trả / Vốn CSH', 'times'),
    'net_debt_ebitda': ('Nợ vay ròng / EBITDA', 'times'), 'interest_coverage': ('Khả năng trả lãi', 'times'),
    'cfo_net_income': ('CFO / LNST', 'times'), 'fcf': ('Dòng tiền tự do', 'VND'),
    'eps': ('EPS TTM', 'VND'), 'bvps': ('BVPS', 'VND'), 'pe': ('P/E', 'times'), 'pb': ('P/B', 'times'),
    'ps': ('P/S', 'times'), 'ev_ebitda': ('EV/EBITDA', 'times'), 'peg': ('PEG', 'times'),
    'dividend_yield': ('Tỷ suất cổ tức', 'ratio'), 'revenue_growth': ('Tăng trưởng doanh thu YoY', 'ratio'),
    'profit_growth': ('Tăng trưởng LNST YoY', 'ratio'), 'eps_growth': ('Tăng trưởng EPS YoY', 'ratio'),
    'leverage': ('Đòn bẩy DuPont', 'times'), 'dupont': ('ROE DuPont (LN toàn DN)', 'ratio'),
    'nim': ('NIM', 'ratio'), 'cir': ('CIR', 'ratio'), 'npl': ('Nợ xấu (NPL)', 'ratio'),
    'llr': ('Bao phủ nợ xấu (LLR)', 'ratio'), 'casa': ('CASA', 'ratio'),
}
LOWER_BETTER = {'pe', 'pb', 'ps', 'ev_ebitda', 'peg', 'debt_equity', 'ccc', 'dio', 'dso', 'net_debt_ebitda', 'npl', 'cir'}
SPECIAL_NA = {'inventory_turnover', 'receivables_turnover', 'payables_turnover', 'fixed_asset_turnover',
              'asset_turnover', 'dio', 'dso', 'dpo', 'ccc', 'gross_margin', 'current_ratio', 'quick_ratio',
              'cash_ratio', 'net_debt_ebitda', 'ev_ebitda', 'ebitda_margin', 'interest_coverage'}


def compute(items: list[dict[str, Any]], price: float | None, shares: float | None,
            industry: str, annual: bool = False, offset: int = 0) -> dict[str, float | None]:
    result: dict[str, float | None] = dict.fromkeys(LABELS)
    count = 1 if annual else 4
    current = items[offset] if len(items) > offset else {}
    start = items[offset+count] if len(items) > offset+count else {}
    if current.get('op49') and current['op49'] > 0:
        shares = current['op49']

    def stock(key: str) -> float | None:
        return current.get(key)

    def avg(key: str) -> float | None:
        a, b = stock(key), start.get(key)
        return (a+b)/2 if a is not None and b is not None else None

    def flow(key: str, shift: int = 0) -> float | None:
        rows = items[offset+shift:offset+shift+count]
        if len(rows) != count or any(r.get(key) is None for r in rows):
            return None
        # Contiguity is checked before calling compute; never annualize one quarter as TTM.
        return sum(r[key] for r in rows)

    revenue, net, parent = flow('is1'), flow('is48'), flow('is14')
    cogs_raw, interest_raw, da = flow('is8'), flow('is51'), flow('cf3')
    cogs = abs(cogs_raw) if cogs_raw is not None else None
    interest = abs(interest_raw) if interest_raw is not None else None
    pbt = flow('is13')
    ebit = pbt + interest if pbt is not None and interest is not None else None
    ebitda = ebit + da if ebit is not None and da is not None else None
    # Equity attributable to owners excludes non-controlling interests on both balance dates.
    equity = stock('bs10')
    minority = stock('bs116')
    owner_equity = equity - minority if equity is not None and minority is not None else None
    avg_equity = avg('bs10')
    avg_minority = avg('bs116')
    avg_owner = avg_equity - avg_minority if avg_equity is not None and avg_minority is not None else None
    result.update(roe=divide(parent, avg_owner), roa=divide(net, avg('bs1')), ros=divide(net, revenue),
                  gross_margin=divide(flow('is2'), revenue), operating_margin=divide(flow('is3'), revenue),
                  ebitda_margin=divide(ebitda, revenue), asset_turnover=divide(revenue, avg('bs1')),
                  inventory_turnover=divide(cogs, avg('bs30')), receivables_turnover=divide(revenue, avg('bs21')),
                  payables_turnover=divide(cogs, avg('bs74')), fixed_asset_turnover=divide(revenue, avg('bs46')),
                  current_ratio=divide(stock('bs2'), stock('bs8')), cash_ratio=divide(stock('bs13'), stock('bs8')),
                  debt_equity=divide(stock('bs6'), equity), cfo_net_income=divide(flow('cf1'), net),
                  interest_coverage=divide(ebit, interest), eps=divide(parent, current.get('weighted_average_shares')),
                  bvps=divide(owner_equity, shares),
                  leverage=divide(avg('bs1'), avg_equity))
    if result['eps'] is None:
        result['eps'] = current.get('reported_eps_ttm')
    current_assets, inventory = stock('bs2'), stock('bs30')
    if current_assets is not None and inventory is not None:
        result['quick_ratio'] = divide(current_assets-inventory, stock('bs8'))
    for days, turns in [('dio', 'inventory_turnover'), ('dso', 'receivables_turnover'), ('dpo', 'payables_turnover')]:
        result[days] = divide(365, result[turns])
    if all(result[k] is not None for k in ['dio', 'dso', 'dpo']):
        result['ccc'] = result['dio'] + result['dso'] - result['dpo']  # type: ignore[operator]
    if flow('cf1') is not None and flow('cf23') is not None:
        result['fcf'] = flow('cf1') - abs(flow('cf23'))  # type: ignore[operator,arg-type]
    short_debt, long_debt, cash = stock('bs83'), stock('bs95'), stock('bs13')
    if short_debt is not None and long_debt is not None and cash is not None:
        net_debt = short_debt+long_debt-cash
        result['net_debt_ebitda'] = divide(net_debt, ebitda)
        if price is not None and shares is not None:
            result['ev_ebitda'] = divide(price*shares+net_debt, ebitda, True)
    result['pe'], result['pb'] = divide(price, result['eps'], True), divide(price, result['bvps'], True)
    result['ps'] = divide(price*shares if price is not None and shares is not None else None, revenue, True)
    for key, field in [('revenue_growth', 'is1'), ('profit_growth', 'is48')]:
        old, value = flow(field, count), flow(field)
        result[key] = divide(value-old if value is not None and old is not None else None, abs(old) if old else None)
    old_item = items[offset+count] if len(items) > offset+count else {}
    old_eps = divide(flow('is14', count), old_item.get('weighted_average_shares'))
    if old_eps is None:
        old_eps = old_item.get('reported_eps_ttm')
    if old_eps is not None and result['eps'] is not None:
        result['eps_growth'] = divide(result['eps']-old_eps, abs(old_eps))
    for key in SPECIAL_NA:
        if industry in ('BANK', 'INVESTMENT', 'INSURANCE'):
            result[key] = None
    if industry != 'MANUFACTURING':
        result['ros'] = result['operating_margin'] = result['ps'] = None
    if industry == 'BANK':
        for key, raw_key in [('nim', 'op10'), ('cir', 'op13'), ('npl', 'op41'), ('llr', 'op42'), ('casa', 'op40')]:
            result[key] = current[raw_key]/100 if current.get(raw_key) not in (None, 0) else None
    if all(result[k] is not None for k in ['ros', 'asset_turnover', 'leverage']):
        result['dupont'] = result['ros'] * result['asset_turnover'] * result['leverage']  # type: ignore[operator]
    # PEG uses verified EPS CAGR; YoY profit growth is not substituted for CAGR.
    return result


def average_available(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return mean(present) if present else None
