import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from app.analytics import industry as industry_math
from app.analytics.broker_reports import merge_reports
from app.analytics.ratios import LABELS, LOWER_BETTER, SPECIAL_NA, average_available, compute
from app.analytics.recommendations import summarize_reports
from app.analytics.zones import calculate_zones
from app.config import settings
from app.connectors.simplize import Simplize
from app.connectors.vietstock import Vietstock
from app.connectors.yahoo import Yahoo
from app.core.cache import cache
from app.core.http import NotFound, SourceError, SourceHTTP
from app.fusion.normalize import simplize_prices, source_date, statements, text, yahoo_prices
from app.fusion.reconcile import reconcile
from app.models import DataField, Meta, Response, now

log = logging.getLogger('finscope')


class FinanceService:
    def __init__(self, http: SourceHTTP):
        self.http = http
        self.simplize, self.vietstock, self.yahoo = Simplize(http), Vietstock(http), Yahoo(http)
        self.peer_limit = asyncio.Semaphore(4)

    async def attempt(self, name: str, action) -> tuple[Any, str]:
        try:
            return await action, 'ok'
        except SourceError as exc:
            self.http.status[name] = exc.status
            log.warning('source_failure', extra={'source': name, 'status': exc.status})
            return None, exc.status
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            self.http.status[name] = 'parse_error'
            log.warning('source_parse_error', extra={'source': name, 'status': type(exc).__name__})
            return None, 'parse_error'

    async def overview(self, ticker: str, source: str = 'auto') -> Response:
        async def load() -> Response:
            connectors = {'simplize': self.simplize, 'vietstock': self.vietstock, 'yahoo': self.yahoo}
            selected = connectors if source == 'auto' else {source: connectors[source]}
            results = await asyncio.gather(*(self.attempt(k, v.fetch_profile(ticker)) for k, v in selected.items()))
            raw = {k: r[0] for k, r in zip(selected, results)}
            status = {k: r[1] for k, r in zip(selected, results)}
            if not any(raw.values()):
                if status.get('simplize') == 'not_found' or all(s == 'not_found' for s in status.values()):
                    raise NotFound('not_found', 'all')
                if source in ('auto', 'simplize'):
                    matches, lookup_status = await self.attempt('simplize', self.simplize.search(ticker))
                    if lookup_status == 'ok' and not any(r.get('ticker') == ticker for r in matches or []):
                        raise NotFound('not_found', 'all')
                raise SourceError('all_sources_failed', 'all')
            s, v, y = (raw.get(k) or {} for k in ['simplize', 'vietstock', 'yahoo'])
            if v and v.get('StockCode') != ticker:
                v = {}
            candidates = []
            if v:
                candidates.append({'source': 'vietstock', 'value': v.get('ClosePrice'),
                                   'period': (source_date(v.get('TradingDate')) or '')[:10],
                                   'url': 'https://finance.vietstock.vn/'})
            if s:
                candidates.append({'source': 'simplize', 'value': s.get('priceClose'),
                                   'period': (source_date(s.get('priceTimeStamp')) or '')[:10],
                                   'url': f'https://simplize.vn/co-phieu/{ticker}',
                                   'note': 'Giữ nguyên thời điểm giá do nguồn cung cấp.'})
            if y:
                candidates.append({'source': 'yahoo', 'value': y.get('regularMarketPrice'),
                                   'period': datetime.fromtimestamp(y['regularMarketTime']).strftime('%Y-%m-%d')
                                   if y.get('regularMarketTime') else None,
                                   'url': f'https://finance.yahoo.com/quote/{ticker}.VN'})
            price = reconcile('price', candidates, settings.price_discrepancy)
            kpis = {'price': price.model_dump()}
            for key, raw_key, unit in [('pe', 'peRatio', 'times'), ('pb', 'pbRatio', 'times'),
                                        ('roe', 'roe', 'ratio'), ('roa', 'roa', 'ratio'),
                                        ('eps', 'epsRatio', 'VND'), ('bvps', 'bookValue', 'VND'),
                                        ('shares', 'outstandingSharesValue', 'shares'),
                                        ('dividend_yield', 'dividendYieldCurrent', 'ratio')]:
                value = s.get(raw_key)
                if unit == 'ratio' and value is not None:
                    value /= 100
                kpis[key] = DataField(field=key, value=value, unit=unit, period=None,
                                      chosen_source='simplize' if value is not None else 'unavailable',
                                      source_url=f'https://simplize.vn/co-phieu/{ticker}',
                                      note='Chỉ số nguồn công bố; endpoint hồ sơ không nêu kỳ tính.').model_dump()
            shares = s.get('outstandingSharesValue')
            kpis['market_cap'] = DataField(field='market_cap', value=price.value*shares
                if isinstance(price.value, (int, float)) and shares else None, period=price.period,
                chosen_source='calculated', note='Giá được chọn × số CP lưu hành nguồn công bố; ngày CP chưa xác minh.').model_dump()
            change = v.get('PerChange') if v else s.get('pctChange')
            warnings = []
            if s.get('priceTimeStamp') and price.period != (source_date(s['priceTimeStamp']) or '')[:10]:
                warnings.append('Giá các nguồn khác thời điểm; xem chi tiết nguồn trước khi đối chiếu.')
            if any(value != 'ok' for value in status.values()):
                warnings.append('Một phần nguồn chưa khả dụng; chỉ hiển thị dữ liệu lấy được.')
            return Response(data={'ticker': ticker, 'name': s.get('name') or y.get('longName') or ticker,
                                  'exchange': s.get('stockExchange'), 'industry': s.get('industryActivity'),
                                  'industry_id': s.get('bcIndustryGroupId'),
                                  'industry_group': s.get('bcIndustryGroupType', 'unknown'),
                                  'description': text(s.get('businessOverall')),
                                  'risks': text(s.get('businessRisk')), 'website': s.get('website'),
                                  'kpis': kpis, 'change_percent': DataField(field='change_percent',
                                  value=change/100 if change is not None else None, unit='ratio', period=price.period,
                                  chosen_source='vietstock' if v else 'simplize').model_dump(),
                                  'reported_at': s.get('analysisUpdated'), 'score': None},
                            meta=Meta(sources_status=status, warnings=warnings))
        result, hit = await cache.get(f'overview:{ticker}:{source}', load, 90)
        result = result.model_copy(deep=True)
        result.meta.cache_hit = hit
        return result

    async def raw_financials(self, ticker: str, period: str = 'quarter', source: str = 'auto') -> tuple[dict, Meta]:
        async def load() -> tuple[dict, Meta]:
            raw, status, warnings = {}, {}, []
            if source in ('auto', 'simplize'):
                (s, status['simplize']), (cf, status['simplize_cf']) = await asyncio.gather(
                    self.attempt('simplize', self.simplize.fetch_financials(ticker, 'ratio', period)),
                    self.attempt('simplize', self.simplize.fetch_financials(ticker, 'cf', period)))
                if s:
                    raw = s
                    cashflows = {r['periodDate']: r for r in (cf or {}).get('items', [])}
                    raw['items'] = [{**r, **{k: v for k, v in cashflows.get(r['periodDate'], {}).items() if k.startswith('cf')}}
                                    for r in raw.get('items', [])]
            if source in ('auto', 'vietstock'):
                v, status['vietstock'] = await self.attempt('vietstock', self.vietstock.fetch_financials(ticker, period))
                if isinstance(v, list) and len(v) > 1:
                    raw['vietstock'] = v
                    eps_rows = [row for rows in v[1].values() for row in rows if row.get('NameEn') == 'Trailing EPS']
                    if eps_rows:
                        reported = {f"{p['TermCode']}/{p['YearPeriod']}": eps_rows[0].get('Value'+str(p['ID'])) for p in v[0]}
                        for item in raw.get('items', []):
                            item['reported_eps_ttm'] = reported.get(item['periodDateName'])
            if not raw:
                raise SourceError('financials_unavailable', source)
            if not raw.get('items'):
                warnings.append('Chỉ có BCTC tóm lược Vietstock; chưa đủ dữ liệu thô để tính hệ số.')
            else:
                warnings.append('Simplize chưa công bố phạm vi hợp nhất/riêng lẻ và trạng thái kiểm toán qua endpoint; không tự coi hai nguồn cùng phạm vi.')
            return raw, Meta(sources_status=status, warnings=warnings)
        result, hit = await cache.get(f'financials:{ticker}:{period}:{source}', load, 21600)
        raw, meta = result
        return raw, meta.model_copy(update={'cache_hit': hit}, deep=True)

    async def financials(self, ticker: str, period: str, statement: str, source: str) -> Response:
        raw, meta = await self.raw_financials(ticker, period, source)
        data = statements(raw, statement, ticker)
        data['cross_check'] = self.vietstock_table(raw.get('vietstock'), statement)
        return Response(data=data, meta=meta)

    @staticmethod
    def vietstock_table(raw, statement: str) -> dict:
        if not raw:
            return {'periods': [], 'rows': []}
        periods = sorted(raw[0], key=lambda p: p['ID'])
        target = {'is': 'Income Statement', 'bs': 'Statement of Financial Position', 'cf': 'Cash Flow'}[statement]
        rows = [r for group in raw[1].values() for r in group if r.get('ReportComponentNameEn') == target
                or (statement == 'bs' and r.get('ReportComponentNameEn') == 'Balance Sheet')]
        return {'periods': [f"{p['TermCode']}/{p['YearPeriod']}" for p in periods],
                'rows': [{'key': str(r['ReportNormID']), 'label': r['Name'],
                          'values': [DataField(field=str(r['ReportNormID']), value=r.get('Value'+str(p['ID']))*1e9
                                             if r.get('Value'+str(p['ID'])) is not None else None,
                                             period=f"{p['TermCode']}/{p['YearPeriod']}", scope=p.get('United', 'unknown'),
                                             chosen_source='vietstock', note=p.get('AuditedStatus')).model_dump()
                                     for p in periods]} for r in rows]}

    async def ratio_values(self, ticker: str, period: str = 'quarter', source: str = 'auto') -> tuple[dict, list, dict, Meta]:
        raw, meta = await self.raw_financials(ticker, period, source)
        overview = await self.overview(ticker, source)
        items = sorted(raw.get('items', []), key=lambda r: r['periodDate'], reverse=True)
        # Break at the first missing quarter/year, so a non-contiguous sequence never becomes TTM.
        contiguous: list[dict[str, Any]] = []
        step = 12 if period == 'year' else 3
        for row in items:
            if contiguous:
                newer = contiguous[-1]['periodDate']
                older = row['periodDate']
                a, b = (int(newer[:4])*12+int(newer[5:7])), (int(older[:4])*12+int(older[5:7]))
                if a-b != step:
                    meta.warnings.append('Chuỗi BCTC đứt kỳ; không gộp các kỳ thiếu thành TTM.')
                    break
            contiguous.append(row)
        p = overview.data['kpis']['price']['value']
        shares = overview.data['kpis']['shares']['value']
        group = raw.get('industryGroup', overview.data['industry_group'])
        history = [compute(contiguous, p, shares, group, period == 'year', i) for i in range(len(contiguous))]
        current = history[0] if history else dict.fromkeys(LABELS)
        if period == 'quarter':
            current['dividend_yield'] = overview.data['kpis']['dividend_yield']['value']
        meta.warnings.append('Chưa có số CP bình quân gia quyền để tự tính EPS. EPS TTM dùng số Vietstock công bố đúng kỳ nếu có; P/E = giá được chọn / EPS công bố. BVPS dùng CP cuối kỳ từ Simplize. Không suy ra multiple lịch sử bằng giá hiện tại.')
        return current, history, {'overview': overview.data, 'items': contiguous, 'group': group}, meta

    async def industry(self, ticker: str, source: str = 'auto') -> Response:
        if source not in ('auto', 'simplize'):
            return Response(data={'peers': [], 'statistics': {}, 'warning': 'Nguồn đã chọn chưa có peers được xác minh.'}, meta=Meta())
        async def load() -> Response:
            main = await self.overview(ticker)
            listing, status = await self.attempt('simplize', self.simplize.fetch('/api/company/peer/'+ticker))
            candidates = (listing or {}).get('peers', [])

            async def profile(p):
                async with self.peer_limit:
                    info, _ = await self.attempt('simplize', self.simplize.fetch_profile(p['ticker']))
                    return info
            profiles = [p for p in await asyncio.gather(*(profile(p) for p in candidates[:24])) if p]
            profiles = [p for p in profiles if p.get('bcIndustryGroupId') == main.data['industry_id'] and p['ticker'] != ticker]
            profiles.sort(key=lambda p: p.get('marketCap') or 0, reverse=True)

            async def peer(p):
                async with self.peer_limit:
                    raw, peer_meta = await self.raw_financials(p['ticker'], 'quarter', 'auto')
                    state = peer_meta.sources_status.get('simplize', 'unavailable')
                    items = sorted((raw or {}).get('items', []), key=lambda r: r['periodDate'], reverse=True)
                    quote = await self.overview(p['ticker'])
                    return {'ticker': p['ticker'], 'name': p['name'], 'period': items[0]['periodDateName'] if items else None,
                            'industry_id': p['bcIndustryGroupId'], 'status': state,
                            'ratios': compute(items, quote.data['kpis']['price']['value'], p.get('outstandingSharesValue'), p['bcIndustryGroupType'])}
            outcomes = await asyncio.gather(*(peer(p) for p in profiles[:8]), return_exceptions=True)
            peers = [p for p in outcomes if isinstance(p, dict)]
            reference = next((p['period'] for p in peers if p['period']), None)
            # Display the period and include only the modal latest period in industry statistics.
            if peers:
                from collections import Counter
                periods = [p['period'] for p in peers if p['period']]
                reference = Counter(periods).most_common(1)[0][0] if periods else None
            valid = [p for p in peers if p['period'] == reference and p['status'] == 'ok']
            return Response(data={'peers': peers, 'statistics': industry_math.aggregate(valid), 'period': reference,
                                  'sample_size': len(valid), 'method': 'Trung vị peers cùng ngành cấp 2, tối đa 8 mã theo vốn hóa, loại multiple ≤0 hoặc >100.',
                                  'warning': 'Mẫu ngành nhỏ, độ tin cậy thấp' if len(valid) < 3 else None},
                            meta=Meta(sources_status={'simplize': status}, warnings=['Giá peers theo thời điểm nguồn; không phải bảng giá đồng bộ realtime.']))
        result, hit = await cache.get('industry:'+ticker, load, 21600)
        result = result.model_copy(deep=True)
        result.meta.cache_hit = hit
        return result

    async def ratios(self, ticker: str, period: str, source: str) -> Response:
        current, history, context, meta = await self.ratio_values(ticker, period, source)
        sector = await self.industry(ticker, source)
        items, group = context['items'], context['group']
        period_name = items[0]['periodDateName'] if items else None
        rows = []
        for key, (label, unit) in LABELS.items():
            na = group in ('BANK', 'INVESTMENT', 'INSURANCE') and key in SPECIAL_NA
            note = f'Không áp dụng cho {group}' if na else 'TTM 4 quý / bình quân đầu-cuối kỳ.'
            if key == 'eps':
                note = 'EPS TTM Vietstock công bố đúng kỳ; chưa có CP bình quân gia quyền để tự tính độc lập.'
            if key == 'pe':
                note = 'Giá được chọn / EPS TTM Vietstock công bố; chưa tự kiểm chứng EPS bằng CP bình quân gia quyền.'
            if key == 'dividend_yield':
                note = 'Tỷ suất cổ tức nguồn công bố; kỳ tính và giá tham chiếu nguồn chưa được công bố.'
            median = sector.data.get('statistics', {}).get(key, {}).get('median') if sector.data.get('period') == period_name and period == 'quarter' else None
            value = current[key]
            assessment = None
            if value is not None and median is not None and median != 0:
                delta = (value-median)/abs(median)
                assessment = 'Trung bình' if abs(delta) < .1 else 'Tốt' if (delta < 0) == (key in LOWER_BETTER) else 'Kém'
            published_map = {'roe': 'op17', 'roa': 'op18', 'pe': 'op1', 'pb': 'op2', 'asset_turnover': 'op19',
                             'ccc': 'op24', 'nim': 'op10', 'cir': 'op13', 'npl': 'op41', 'llr': 'op42', 'casa': 'op40'}
            published = items[0].get(published_map.get(key, '')) if items else None
            if published is not None and unit == 'ratio':
                published /= 100
            discrepancy = key not in ('pe', 'pb') and value is not None and published is not None and abs(value-published) > settings.ratio_discrepancy*max(abs(value), 1e-12)
            bank_reported = group == 'BANK' and key in ('nim', 'cir', 'npl', 'llr', 'casa')
            rows.append({'key': key, 'label': label, 'current': DataField(field=key, value=value, unit=unit,
                         period=('TTM đến ' if period == 'quarter' else '')+(period_name or 'không rõ'),
                         scope='source_unspecified', chosen_source='vietstock' if key == 'eps' and value is not None else 'simplize' if bank_reported or key == 'dividend_yield' else 'calculated',
                         discrepancy=discrepancy, alternates=[{'source': 'simplize', 'value': published, 'period': period_name}] if published is not None else [],
                         note='Nguồn công bố; chưa đủ dữ liệu để tự tính.' if bank_reported else note,
                         source_url='https://finance.vietstock.vn/' if key == 'eps' else f'https://simplize.vn/co-phieu/{ticker}/so-lieu-tai-chinh').model_dump(),
                         'previous': history[1][key] if len(history) > 1 and key not in ('pe', 'pb', 'ps', 'ev_ebitda') else None,
                         'year_ago': history[4 if period == 'quarter' else 1][key] if len(history) > (4 if period == 'quarter' else 1) and key not in ('pe', 'pb', 'ps', 'ev_ebitda') else None,
                         'average_3y': average_available([history[i][key] for i in ([4, 8, 12] if period == 'quarter' else [1, 2, 3])])
                         if key not in ('pe', 'pb', 'ps', 'ev_ebitda') and len(history) > (12 if period == 'quarter' else 3)
                         and all(history[i][key] is not None for i in ([4, 8, 12] if period == 'quarter' else [1, 2, 3])) else None,
                         'industry_median': median, 'assessment': assessment, 'not_applicable': na,
                         'trend': [h[key] for h in history[:8]][::-1] if key not in ('pe', 'pb', 'ps', 'ev_ebitda') else []})
        return Response(data={'rows': rows, 'values': current, 'industry': sector.data, 'industry_group': group,
                              'period': period_name, 'history': history[:8]}, meta=meta)

    async def prices(self, ticker: str, range_: str, source: str) -> Response:
        if source == 'vietstock':
            return Response(data={'items': [], 'note': 'Chọn Tự động hoặc Simplize để xem chuỗi giá.'}, meta=Meta())
        async def load() -> Response:
            statuses = {}
            items = []
            chosen = 'yahoo'
            if source in ('auto', 'yahoo'):
                data, statuses['yahoo'] = await self.attempt('yahoo', self.yahoo.fetch_prices(ticker, range_))
                items = yahoo_prices(data) if data else []
            if not items and source in ('auto', 'simplize'):
                # Public chart UI uses 1m / 3m / 1y / 5y; filter a verified larger window for 6m.
                period = {'1mo': '1m', '3mo': '3m', '6mo': '1y', '1y': '1y', '5y': '5y'}[range_]
                raw, statuses['simplize'] = await self.attempt('simplize', self.simplize.fetch(
                    f'/api/historical/prices/chart?ticker={ticker}&period={period}'))
                items = simplize_prices(raw or [])
                if range_ == '6mo':
                    cutoff = (datetime.fromisoformat(now()) - timedelta(days=183)).date().isoformat()
                    items = [r for r in items if r['date'] >= cutoff]
                chosen = 'simplize'
            url = f'https://finance.yahoo.com/quote/{ticker}.VN/history/' if chosen == 'yahoo' else f'https://simplize.vn/co-phieu/{ticker}'
            return Response(data={'items': items, 'source': chosen, 'unit': 'VND', 'source_url': url,
                                  'note': 'OHLCV theo nguồn; các nguồn có thể điều chỉnh sự kiện doanh nghiệp khác nhau.'
                                  if items else 'Chưa có chuỗi giá từ các nguồn được chọn.'},
                            meta=Meta(sources_status=statuses))
        result, hit = await cache.get(f'prices:{ticker}:{range_}:{source}', load, 1200)
        result = result.model_copy(deep=True)
        result.meta.cache_hit = hit
        return result

    async def valuation(self, ticker: str, source: str) -> Response:
        current, _, context, meta = await self.ratio_values(ticker, source=source)
        listing = await self.broker_reports(ticker, 1, source)
        reports = listing.data['items']
        recent = summarize_reports(reports, context['overview']['kpis']['price']['value'])['reports']
        from statistics import mean, pstdev
        items = context['items']
        pe_history = [r['op1'] for r in items if r.get('op1') and 0 < r['op1'] <= 100]
        pb_history = [r['op2'] for r in items if r.get('op2') and 0 < r['op2'] <= 100]
        zones = calculate_zones(context['overview']['kpis']['price']['value'], current['eps'], current['bvps'],
                                pe_history, pb_history, [r['targetPrice'] for r in recent])
        bands = [{'name': name, 'mean': mean(values), 'std': pstdev(values), 'values': values,
                  'source': 'simplize', 'note': 'Multiple lịch sử do nguồn công bố; chưa tái dựng độc lập.'}
                 for name, values in [('P/E', pe_history), ('P/B', pb_history)] if len(values) >= 8]
        meta.sources_status.update(listing.meta.sources_status)
        meta.warnings.append('Band dùng multiple lịch sử nguồn công bố; số tự tính được đối chiếu trong tab Hệ số. Chưa tái dựng độc lập từng giá cuối kỳ.')
        return Response(data={'multiples': {k: current[k] for k in ['pe', 'pb', 'ps', 'ev_ebitda', 'eps', 'bvps']},
                              'reports': reports, 'reports_has_more': listing.data['has_more'],
                              'zones': zones, 'bands': bands, 'band_note': meta.warnings[-1]}, meta=meta)

    async def broker_reports(self, ticker: str, page: int, source: str) -> Response:
        if source not in ('auto', 'simplize'):
            return Response(data={'items': [], 'has_more': False, 'page': page}, meta=Meta())
        raw, status = await self.attempt('simplize', self.simplize.fetch(
            f'/api/company/analysis-report/list?ticker={ticker}&isWl=false&page={page}&size=20'))
        summary = []
        if page == 1:
            public, _ = await self.attempt('simplize', self.simplize.fetch_page(ticker))
            summary = (public or {}).get('analysisReports', [])
        rows = raw if isinstance(raw, list) else []
        return Response(data={'items': merge_reports(summary, rows), 'has_more': len(rows) == 20, 'page': page},
                        meta=Meta(sources_status={'simplize_reports': status},
                                  warnings=['Báo cáo lịch sử giữ ngày công bố; chỉ báo cáo giá mục tiêu trong 180 ngày mới tham gia tính vùng giá.']))

    async def ownership(self, ticker: str, source: str) -> Response:
        if source not in ('auto', 'simplize'):
            return Response(data={'breakdown': [], 'holders': []}, meta=Meta(warnings=['Cổ đông nguồn được chọn chưa xác minh.']))
        results = await asyncio.gather(self.attempt('simplize', self.simplize.fetch('/api/company/ownership/ownership-breakdown/'+ticker)),
                                       self.attempt('simplize', self.simplize.fetch('/api/company/ownership/shareholder-fund-details/'+ticker+'?page=1&size=20')))
        return Response(data={'breakdown': results[0][0] or [], 'holders': (results[1][0] or {}).get('shareholderDetails', []),
                              'source_url': f'https://simplize.vn/co-phieu/{ticker}/ho-so-doanh-nghiep',
                              'period': None, 'note': 'Nguồn không nêu ngày chốt sở hữu; tỷ lệ và số lượng CP có thể khác ngày.'},
                        meta=Meta(sources_status={'simplize': results[1][1]}))

    async def events(self, ticker: str, source: str) -> Response:
        page, status = await self.attempt('simplize', self.simplize.fetch_page(ticker)) if source in ('auto', 'simplize') else ({}, 'not_selected')
        rows: list[dict[str, Any]] = [{'id': str(r.get('id') or 'dividend-'+str(i)), 'title': text(r['content']), 'date': source_date(r['date']), 'type': 'dividend', 'source': 'simplize',
                 'summary': text(r['content']), 'image_url': None, 'dates': {},
                 'url': f'https://simplize.vn/co-phieu/{ticker}/tin-tuc'} for i, r in enumerate((page or {}).get('dividendPayment', []))]
        rows += [{'id': str(r.get('id') or 'disclosure-'+str(i)), 'title': text(r['title']), 'date': source_date(r['createdDate']), 'type': 'disclosure', 'source': 'simplize',
                  'summary': text(r.get('description') or r.get('content') or ''),
                  'image_url': r.get('thumbUrl') or r.get('imageUrl'),
                  'dates': {label: source_date(r.get(key)) for label, key in
                            [('Ngày GDKHQ', 'exDividendDate'), ('Ngày đăng ký cuối', 'recordDate'), ('Ngày thực hiện', 'executionDate')]
                            if r.get(key)},
                  'url': r.get('attachedLink')} for i, r in enumerate((page or {}).get('companyNews', []))]
        rows.sort(key=lambda r: r['date'] or '', reverse=True)
        return Response(data={'items': rows}, meta=Meta(sources_status={'simplize': status}))
