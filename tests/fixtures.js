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
