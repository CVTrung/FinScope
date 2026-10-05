export function intelFixture() {
  const ref = { source_name: 'FPT disclosure', source_url: 'https://fpt.com/ir' };
  return {
    metadata: {
      market: 'Việt Nam',
      exchange: 'HOSE',
      start_date: '2026-07-05',
      end_date: '2026-10-05',
      generated_at: '2026-10-05T03:00:00Z',
      focus: 'FPT',
      status: 'complete',
    },
    articles: [
      {
        published_at: '2026-09-20',
        event_date: null,
        tickers: ['FPT'],
        title: 'FPT company update',
        summary: 'FPT reported revenue of 12000 billion VND.',
        facts: ['Reported annual revenue 12000 billion VND.'],
        analysis: 'Technology demand remains a factor to monitor.',
        sentiment: 'mixed',
        impact_horizon: 'medium_term',
        confidence: 'medium',
        ...ref,
        verification_status: 'snippet_only',
      },
    ],
    insights: [
      {
        category: 'company',
        subject: 'FPT business drivers',
        analysis: 'Technology demand remains a factor to monitor.',
        sentiment: 'mixed',
        impact_horizon: 'medium_term',
        confidence: 'medium',
        risks: ['Demand uncertainty'],
        evidence_sources: [ref],
      },
    ],
    watchlist: [
      {
        ticker: 'FPT',
        reason: 'Monitor technology demand.',
        valuation_view: null,
        catalysts: ['Technology demand'],
        risks: ['Demand uncertainty'],
        horizon: 'medium_term',
        confidence: 'medium',
        evidence_sources: [ref],
      },
    ],
    sources: [
      {
        ...ref,
        source_type: 'company_disclosure',
        published_at: '2026-09-20',
        verification_status: 'snippet_only',
      },
    ],
    limitations: ['Demonstration fixture only.'],
    disclaimer: 'For education only.',
  };
}
