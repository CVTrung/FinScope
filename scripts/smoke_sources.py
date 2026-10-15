"""Manual live check only; CI uses fixtures. Run from project root with .venv Python."""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'api'))
from app.core.http import SourceHTTP
from app.services import FinanceService
from app.models import now


async def main():
    http = SourceHTTP()
    service = FinanceService(http)
    results = []
    try:
        for ticker in ['VNM', 'FPT', 'VCB', 'HPG', 'SSI', 'VHM', 'VEF']:
            try:
                ov = await service.overview(ticker)
                values, history, context, meta = await service.ratio_values(ticker)
                result = {'ticker': ticker, 'exchange': ov.data['exchange'], 'group': context['group'],
                          'sources': ov.meta.sources_status, 'financial_sources': meta.sources_status,
                          'periods': len(context['items']), 'roe': values['roe'], 'roa': values['roa'],
                          'inventory_turnover': values['inventory_turnover'], 'cfo_net_income': values['cfo_net_income']}
                for name, connector in [('simplize', service.simplize), ('vietstock', service.vietstock), ('yahoo', service.yahoo)]:
                    action = connector.fetch_prices(ticker, '1y') if name == 'yahoo' else connector.fetch_profile(ticker)
                    raw, status = await service.attempt(name, action)
                    if raw:
                        path = ROOT/'api/tests/fixtures'/f'{name}-{ticker}.json'
                        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps(result, ensure_ascii=True), flush=True)
                results.append(result)
            except (ValueError, KeyError, TypeError) as exc:
                results.append({'ticker': ticker, 'error': type(exc).__name__})
    finally:
        await http.client.aclose()
    (ROOT/'artifacts').mkdir(exist_ok=True)
    (ROOT/'artifacts/live-sources.json').write_text(json.dumps({'generated_at': now(), 'results': results}, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
