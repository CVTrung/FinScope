import { fixture, target } from './fixtures.js';
export function coverageFixture(unmapped = false) {
  const data = fixture();
  data.company = {
    ...data.company,
    name: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    sourceIds: ['A'],
  };
  data.quote = { ...data.quote, price: null, sourceIds: [] };
  data.metrics = [];
  data.financials = [
    ['annual', '2025-12-31', 12000, 'A'],
    ['annual', '2025-12-31', 12500, 'B'],
    ['ytd', '2026-06-30', 6400, 'A'],
    ['quarterly', '2026-06-30', 3400, 'A'],
    ['annual', '2022-12-31', 8000, 'A'],
  ].map(([kind, period, revenue, id]) => ({
    kind,
    period,
    periodStart: kind === 'ytd' ? '2026-01-01' : '',
    revenue,
    unit: 'billion VND',
    currency: 'VND',
    profitBasis: 'consolidated',
    cashFlowBasis: 'unknown',
    netIncome: null,
    operatingCashFlow: null,
    netMargin: null,
    debtEquity: null,
    sourceIds: [id],
  }));
  data.targets = [
    target({
      firm: 'KBSV',
      publishedAt: '2026-09-15',
      target: 86000,
      comparable: false,
      basis: '',
      sourceIds: ['C'],
    }),
    target({
      firm: 'SSI',
      publishedAt: '',
      target: null,
      comparable: false,
      basis: '',
      currency: '',
      sourceIds: ['C'],
    }),
  ];
  data.analysis = { question: '', observations: [], risks: [], conclusion: '' };
  const sections = [
    {
      id: 'A',
      url: 'https://vietstock.vn/2026/10/fpt.htm',
      title: 'Vietstock',
      text: 'FPT Corporation ticker FPT exchange HOSE Vietnam.\n\nFPT annual 2025 revenue 12000 billion VND consolidated, period 2025-12-31.\n\nFPT YTD first half 2026 revenue 6400 billion VND consolidated.\n\nFPT Q2 2026 revenue 3400 billion VND consolidated.\n\nFPT annual 2022 revenue 8000 billion VND consolidated.',
    },
    {
      id: 'B',
      url: 'https://cafef.vn/fpt.htm',
      title: 'CafeF',
      text: 'FPT annual 2025 revenue 12500 billion VND consolidated, period 2025-12-31.',
    },
    {
      id: 'C',
      url: 'https://finance.vietstock.vn/bao-cao-phan-tich/fpt.htm',
      title: 'Broker coverage',
      text: 'FPT KBSV report 15/09/2026 target price 86000 VND. FPT SSI research report: target and date unavailable.',
    },
  ];
  return {
    data,
    snapshot: {
      query: 'FPT',
      language: 'vi',
      generatedAt: '2026-10-04T03:00:00Z',
      direct: null,
      results: sections.map(({ id, url, title, text }) => ({
        section: id === 'C' ? 'brokers' : 'company',
        text,
        sources: [{ id, url, title }],
        claims: unmapped ? [] : text.split('\n\n').map((text) => ({ text, sourceIds: [id] })),
      })),
    },
  };
}
