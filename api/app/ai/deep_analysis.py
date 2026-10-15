import asyncio

from app.ai.client import Gemini
from app.ai.news_pipeline import news
from app.ai.schemas import Analysis, ResearchPlan
from app.analytics.deep import price_risk, ratio_changes, scenarios
from app.models import Response


async def deep_analysis(service, ticker: str, question: str, source: str) -> Response:
    ratios, prices, valuation = await asyncio.gather(service.ratios(ticker, 'quarter', source),
        service.prices(ticker, '1y', source), service.valuation(ticker, source))
    ai = Gemini(service.http.client)
    plan = await ai.generate({'ticker': ticker, 'question': question, 'ratios': ratios.data['values']},
                             ResearchPlan, set(), 'research-plan', budget=12)
    focus = plan.get('result', {}).get('focus') or ['cash_flow', 'growth', 'valuation', 'risk', 'news', 'ownership']
    steps = [{'name': 'AI chọn hướng nghiên cứu', 'status': 'ok' if plan.get('available') else 'code_fallback'}]
    facts = {'ticker': ticker, 'question': question, 'period': ratios.data['period'], 'ratios': ratios.data['values']}
    metrics = {'price_risk': price_risk(prices.data['items']), 'changes': ratio_changes(ratios.data['rows']),
               'scenarios': scenarios(ratios.data['values'])}
    facts['calculations'] = metrics
    facts['industry'] = ratios.data['industry']
    facts['broker_reports'] = valuation.data['reports']
    steps.append({'name': 'Code tính biến động, sụt giảm, thay đổi cùng kỳ và độ nhạy multiple', 'status': 'ok'})
    if any(group in focus for group in ('cash_flow', 'growth')):
        reports = await asyncio.gather(service.financials(ticker, 'year', 'is', source),
                                       service.financials(ticker, 'year', 'cf', source))
        facts['annual_statements'] = [r.data for r in reports]
        steps.append({'name': 'Đọc báo cáo KQKD và dòng tiền theo năm', 'status': 'ok'})
    if 'news' in focus:
        listing = await news(service, ticker, 90, 'auto')
        facts['news'] = [{'headline': r['headline'], 'content': (r.get('content') or r['description'])[:4500],
                          'source': r['sources'][0]['url']} for r in listing.data['items'][:6]]
        steps.append({'name': 'Đọc nội dung chi tiết của các tin gần đây', 'status': 'ok' if facts['news'] else 'empty'})
    if 'ownership' in focus:
        ownership = await service.ownership(ticker, source)
        facts['ownership'] = ownership.data
        steps.append({'name': 'Kiểm tra cơ cấu và cổ đông lớn', 'status': 'ok'})
    evidence = {k for k, v in ratios.data['values'].items() if v is not None} | {'price_risk', 'changes', 'scenarios', 'industry', 'broker_reports'}
    evidence |= {key for key in ('annual_statements', 'news', 'ownership') if key in facts}
    result = await ai.generate(facts, Analysis, evidence, 'deep', budget=50)
    steps.append({'name': 'AI tổng hợp lập luận và bằng chứng', 'status': 'ok' if result.get('available') else 'unavailable'})
    return Response(data={'ai': result, 'plan': plan, 'focus': focus, 'steps': steps, 'metrics': metrics,
                          'price_source': prices.data.get('source'), 'period': ratios.data['period'],
                          'note': 'Biến động dùng log-return theo phiên × √252. Sụt giảm tính từ đỉnh trong chuỗi một năm. Kịch bản là độ nhạy, không phải giá mục tiêu.'}, meta=ratios.meta)
