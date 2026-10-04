import { geminiModel } from './gemini.js';
import { reportSchema, cleanReport } from '../shared/report.js';

const emptyAnalysis = () => ({ question: '', observations: [], risks: [], conclusion: '' });

// Compare like periods, currencies, scales and accounting scope. No inferred quarters.
export function calculateGrowth(financials) {
  const result = [];
  for (const row of financials) {
    if (row.conflictGroup || row.evidenceStatus === 'sources-only' || !row.unit || !row.currency)
      continue;
    const previousDate = `${Number(row.period.slice(0, 4)) - 1}${row.period.slice(4)}`;
    const previous = financials.find(
      (item) =>
        item.period === previousDate &&
        item.kind === row.kind &&
        item.currency === row.currency &&
        item.unit === row.unit &&
        item.profitBasis === row.profitBasis &&
        !item.conflictGroup &&
        item.evidenceStatus !== 'sources-only' &&
        (item.periodStart || '') ===
          (row.periodStart
            ? `${Number(row.periodStart.slice(0, 4)) - 1}${row.periodStart.slice(4)}`
            : ''),
    );
    if (!previous) continue;
    for (const metric of ['revenue', 'netIncome']) {
      if (metric === 'netIncome' && row.profitBasis === 'unknown') continue;
      if (!Number.isFinite(row[metric]) || !(previous[metric] > 0)) continue;
      result.push({
        metric,
        period: row.period,
        previousPeriod: previous.period,
        kind: row.kind,
        percent: (row[metric] / previous[metric] - 1) * 100,
        sourceIds: [...new Set([...row.sourceIds, ...previous.sourceIds])],
      });
    }
  }
  return result;
}

export function facts(snapshot, language) {
  const { direct, id, query, generatedAt, priceData, priceWarning } = snapshot;
  const vi = language === 'vi';
  const sources = [...direct.sources];
  const report = cleanReport(
    reportSchema.parse({
      company: {
        name: direct.company.name,
        ticker: direct.company.ticker,
        exchange: direct.company.exchange,
        sector: '',
        country: vi ? 'Việt Nam' : 'Vietnam',
        description: vi
          ? `${direct.company.name} · ${direct.company.ticker} · ${direct.company.exchange}. Hồ sơ niêm yết từ Vietstock.`
          : `${direct.company.name} · ${direct.company.ticker} · ${direct.company.exchange}. Listing profile from Vietstock.`,
        sourceIds: ['D1'],
      },
      summary: '',
      quote: direct.quote || {
        price: null,
        currency: 'VND',
        asOf: '',
        changePercent: null,
        basis: '',
        sourceIds: [],
      },
      metrics: (direct.ratios || []).map((ratio) => ({
        label: vi ? ratio.originalLabel || ratio.label : ratio.label,
        value: `${ratio.value} ${ratio.unit}`,
        period: ratio.period,
        sourceIds: ratio.sourceIds,
      })),
      financials: direct.financials.map((row) => ({ ...row, unit: vi ? 'tỷ VND' : 'billion VND' })),
      targets: [],
      peers: [],
      news: [],
      priceHistory: [],
      analysis: emptyAnalysis(),
      limitations: [
        vi
          ? 'Chỉ hiển thị dữ liệu lấy trực tiếp. Không suy đoán dòng tiền, dữ liệu doanh nghiệp cùng ngành hoặc cơ sở điều chỉnh giá mục tiêu còn thiếu.'
          : 'Only directly retrieved data is shown. Missing cash flow, peers and target adjustment basis are not inferred.',
        ...(direct.gaps.length
          ? [
              vi
                ? 'Một số mục Vietstock chưa truy xuất được.'
                : 'Some Vietstock sections were unavailable.',
            ]
          : []),
        ...(priceWarning ? ['Price history is currently unavailable.'] : []),
      ],
    }),
    sources,
    generatedAt,
  );
  return {
    ...report,
    id,
    query,
    language,
    generatedAt,
    sources,
    model: geminiModel(),
    workflow: 'direct-analysis-v1',
    evidenceMode: 'direct',
    research: [
      {
        section: direct.section,
        text: direct.text,
        claims: direct.claims,
        queries: [],
        searchSuggestions: '',
      },
    ],
    directEvidence: {
      provider: 'Vietstock',
      retrievedAt: direct.retrievedAt,
      reports: direct.reports,
      events: direct.events,
      documents: direct.documents,
      gaps: direct.gaps,
    },
    growth: calculateGrowth(report.financials),
    priceData,
    warnings: [],
    analysisStatus: { state: 'pending', message: '', retryAfterSeconds: 0 },
  };
}

// Compatibility for browser-saved reports created before grounded research v2.
export function localizeCompanyReport(report, language) {
  return {
    ...report,
    language,
    analysisStatus: {
      state: 'expired',
      message: 'Cached evidence has expired. Start a new company search to refresh it.',
      retryAfterSeconds: 0,
    },
  };
}
