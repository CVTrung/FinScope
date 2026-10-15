import pytest

from app.analytics.industry import aggregate
from app.analytics.ratios import SPECIAL_NA, compute, divide
from app.analytics.scoring import score
from app.analytics.watchlist_flags import flags
from app.analytics.zones import calculate_zones
from app.fusion.reconcile import reconcile


@pytest.fixture
def periods():
    # Nine quarters with constant stocks and independently hand-calculated flows.
    return [{'is1': 100., 'is2': 40., 'is3': 14., 'is8': -60., 'is48': 10., 'is14': 8., 'is13': 12., 'is51': -2.,
                 'bs1': 400., 'bs10': 200., 'bs116': 40., 'bs2': 200., 'bs8': 100., 'bs30': 40., 'bs21': 20.,
                 'bs74': 30., 'bs46': 100., 'bs13': 40., 'bs6': 200., 'bs83': 50., 'bs95': 20.,
                 'cf1': 12., 'cf3': 2., 'cf23': -5., 'op49': 10., 'weighted_average_shares': 10.} for _ in range(9)]


@pytest.mark.parametrize('key,expected', [
    ('roe', .2), ('roa', .1), ('ros', .1), ('gross_margin', .4), ('operating_margin', .14),
    ('ebitda_margin', .16), ('asset_turnover', 1), ('inventory_turnover', 6),
    ('receivables_turnover', 20), ('payables_turnover', 8), ('fixed_asset_turnover', 4),
    ('dio', 365/6), ('dso', 365/20), ('dpo', 365/8), ('ccc', 365/6+365/20-365/8),
    ('current_ratio', 2), ('quick_ratio', 1.6), ('cash_ratio', .4), ('debt_equity', 1),
    ('net_debt_ebitda', 30/64), ('interest_coverage', 7), ('cfo_net_income', 1.2),
    ('fcf', 28), ('eps', 3.2), ('bvps', 16), ('pe', 31.25), ('pb', 6.25),
    ('ps', 2.5), ('ev_ebitda', 1030/64), ('leverage', 2), ('dupont', .2),
    ('revenue_growth', 0), ('profit_growth', 0), ('eps_growth', 0),
])
def test_hand_calculated_formulas(periods, key, expected):
    assert compute(periods, 100, 10, 'MANUFACTURING')[key] == pytest.approx(expected)


def test_no_fake_ttm_or_zero_denominator(periods):
    assert compute(periods[:3], 100, 10, 'MANUFACTURING')['roe'] is None
    for row in periods:
        row['bs30'] = 0
        row['is14'] = -1
    result = compute(periods, 100, 10, 'MANUFACTURING')
    assert result['inventory_turnover'] is None
    assert result['pe'] is None
    assert divide(None, 2) is None
    assert divide(2, 0) is None


@pytest.mark.parametrize('group', ['BANK', 'INVESTMENT', 'INSURANCE'])
def test_sector_specific_ratios(periods, group):
    result = compute(periods, 100, 10, group)
    assert all(result[k] is None for k in SPECIAL_NA)
    assert result['roe'] == pytest.approx(.2)


def test_eps_growth_accounts_for_share_issuance(periods):
    periods[4]['weighted_average_shares'] = 5
    assert compute(periods, 100, 10, 'MANUFACTURING')['eps_growth'] == -.5


def test_missing_weighted_shares_uses_reported_eps_without_inventing_average(periods):
    for row in periods:
        row.pop('weighted_average_shares')
    assert compute(periods, 100, 10, 'MANUFACTURING')['eps'] is None
    periods[0]['reported_eps_ttm'] = 4
    result = compute(periods, 100, 10, 'MANUFACTURING')
    assert result['eps'] == 4 and result['pe'] == 25


def test_valuation_methods_and_negative_earnings():
    zones = calculate_zones(100, 10, 20, [10]*12, [5]*12, [100, 100], support=200, resistance=90)
    assert zones['fair_mid'] == 100
    assert zones['buy'] == [75, 85]
    assert zones['sell'][0] <= zones['sell'][1]
    assert zones['confidence'] == 'Cao'
    loss = calculate_zones(100, -1, None, [10]*12, [], [])
    assert not loss['available']


def test_industry_removes_outliers_and_handles_small_sample():
    result = aggregate([{'ratios': {'pe': v}} for v in [-5, 8, 10, 12, 101]])
    assert result['pe']['median'] == 10
    assert result['pe']['count'] == 3
    result = score({'roe': .2}, [{'ratios': {'roe': v}} for v in [.1, .15, .3]])
    assert result['total'] == pytest.approx(100*2/3)
    assert result['coverage'] == pytest.approx(.25/3)
    assert score({}, [])['total'] is None


def test_watch_flags_only_with_available_evidence():
    assert flags({}) == []
    assert flags({'current_ratio': .9})[0]['warning_threshold'] == 1


def test_fusion_threshold_and_period_alignment():
    candidates = [{'source': 'a', 'value': 100., 'period': '2026-10-15'},
                  {'source': 'b', 'value': 102., 'period': '2026-10-15'}]
    assert reconcile('price', candidates, .005).discrepancy
    candidates[1]['period'] = '2026-10-14'
    assert not reconcile('price', candidates, .005).discrepancy
    assert reconcile('price', [], .005).value is None
