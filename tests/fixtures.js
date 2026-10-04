export function fixture() {
  return {
    company: {
      name: 'Example Company',
      ticker: 'EX',
      exchange: 'TEST',
      sector: 'Technology',
      country: 'Vietnam',
      description: 'Test fixture only.',
      sourceIds: ['F1'],
    },
    summary: 'Test research',
    quote: {
      price: 100,
      currency: 'VND',
      asOf: '2026-10-02',
      changePercent: 0,
      basis: 'Ordinary shares after June 2026 bonus issue',
      sourceIds: ['F1'],
    },
    metrics: [{ label: 'P/E', value: '20×', period: 'TTM', sourceIds: ['F1'] }],
    priceHistory: [],
    financials: [],
    peers: [],
    news: [],
    targets: [],
    analysis: {
      question: 'Test question?',
      observations: [],
      risks: [],
      conclusion: 'Insufficient evidence.',
    },
    limitations: [],
    generatedAt: '2026-10-03T03:00:00.000Z',
  };
}
export function target(overrides = {}) {
  return {
    firm: 'Firm A',
    publishedAt: '2026-09-20',
    target: 120,
    currency: 'VND',
    basis: 'Ordinary shares after June 2026 bonus issue',
    comparable: true,
    horizon: '12 months',
    rating: 'Hold',
    thesis: 'Test',
    assumptions: 'Test',
    risks: 'Test',
    sourceIds: ['F1'],
    ...overrides,
  };
}
export const sources = [{ id: 'F1', title: 'Example filing', url: 'https://example.com/filing' }];

export function vietstockFixture() {
  const company = {
    name: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    url: 'https://finance.vietstock.vn/FPT-ctcp-fpt.htm',
  };
  const financials = [2024, 2025].map((year) => ({
    kind: 'annual',
    period: `${year}-12-31`,
    unit: 'billion VND',
    currency: 'VND',
    revenue: year === 2024 ? 10000 : 12000,
    netIncome: year === 2024 ? 2000 : 2200,
    operatingCashFlow: null,
    netMargin: null,
    debtEquity: null,
    profitBasis: 'consolidated',
    cashFlowBasis: 'unknown',
    sourceIds: ['D2'],
  }));
  const pdf = 'https://finance.vietstock.vn/downloadedoc/123';
  const claims = [
    {
      text: 'Company: FPT Corporation; ticker=FPT; exchange=HOSE; country=Vietnam.',
      sourceIds: ['D1'],
    },
    {
      text: 'Reported annual financial statement: ' + JSON.stringify(financials),
      sourceIds: ['D2'],
    },
    {
      text: 'Original PDF text for KBSV, FPT. listing date=2026-09-21.\nPage 1\nFPT report 15/09/2026. Giá mục tiêu: 86.000 VND. Mua.',
      sourceIds: ['DP1'],
    },
  ];
  return {
    company,
    financials,
    quote: null,
    ratios: [],
    reports: [
      { firm: 'KBSV', title: 'FPT report', listedAt: '2026-09-21', url: pdf, originalPdfUrl: pdf },
    ],
    events: [],
    documents: [],
    gaps: [],
    section: 'Direct Vietstock evidence',
    retrievedAt: '2026-10-03T03:00:00Z',
    claims,
    sources: [
      { id: 'D1', title: 'Profile', url: company.url },
      { id: 'D2', title: 'Financials', url: company.url + '?tab=tai-chinh' },
      { id: 'DP1', title: 'Original KBSV PDF', url: pdf },
    ],
    text: claims.map((item) => item.text).join('\n\n'),
  };
}
export const priceFixture = () => ({
  ticker: 'FPT',
  currency: 'VND',
  provider: 'Vietstock',
  points: [],
  sources: [],
  windowStats: {},
});
