import { z } from 'zod';

const text = z.string();
const number = z.number().nullable();
const refs = z.array(text);
const observation = z.object({
  title: text,
  detail: text,
  alternative: text,
  nextStep: text,
  sourceIds: refs,
});

export const reportSchema = z.object({
  company: z.object({
    name: text,
    ticker: text,
    exchange: text,
    sector: text,
    country: text,
    description: text,
    sourceIds: refs,
  }),
  summary: text,
  quote: z.object({
    price: number,
    currency: text,
    asOf: text,
    changePercent: number,
    basis: text,
    sourceIds: refs,
  }),
  metrics: z.array(z.object({ label: text, value: text, period: text, sourceIds: refs })),
  priceHistory: z.array(
    z.object({ date: text, close: z.number(), currency: text, basis: text, sourceIds: refs }),
  ),
  financials: z.array(
    z.object({
      period: text,
      kind: z.enum(['annual', 'quarterly', 'ytd']),
      periodStart: text.default(''),
      currency: text,
      unit: text,
      profitBasis: z
        .enum(['consolidated', 'attributable', 'standalone', 'unknown'])
        .default('unknown'),
      cashFlowBasis: z.enum(['consolidated', 'standalone', 'unknown']).default('unknown'),
      revenue: number,
      netIncome: number,
      operatingCashFlow: number,
      netMargin: number,
      debtEquity: number,
      sourceIds: refs,
    }),
  ),
  peers: z.array(
    z.object({
      name: text,
      ticker: text,
      pe: number,
      netMargin: number,
      debtEquity: number,
      period: text,
      caveat: text,
      sourceIds: refs,
    }),
  ),
  news: z.array(
    z.object({
      title: text,
      publisher: text,
      publishedAt: text,
      eventDate: text,
      topic: text,
      category: z.enum(['industry', 'technology', 'market']),
      summary: text,
      significance: text,
      sourceIds: refs,
    }),
  ),
  analysis: z.object({
    question: text,
    observations: z.array(observation),
    risks: z.array(text),
    conclusion: text,
  }),
  targets: z.array(
    z.object({
      firm: text,
      publishedAt: text,
      target: number,
      currency: text,
      basis: text,
      comparable: z.boolean(),
      horizon: text,
      rating: text,
      thesis: text,
      assumptions: text,
      risks: text,
      sourceIds: refs,
    }),
  ),
  limitations: z.array(text),
});

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function validDate(value) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d))?$/.test(
      value,
    )
  )
    return null;
  const date = new Date(value);
  const calendarDate = new Date(value.slice(0, 10));
  if (
    !Number.isFinite(date.getTime()) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    return null;
  return date;
}

// Calculated in code, never delegated to a model. Unknown values remain null.
export function summarizeTargets(report, days = 90) {
  const now = new Date(report.generatedAt);
  const latest = new Map();
  for (const target of report.targets) {
    const date = validDate(target.publishedAt);
    if (!date || date > now) continue;
    const firm = target.firm.trim().toLowerCase();
    if (!latest.has(firm) || date > validDate(latest.get(firm).publishedAt))
      latest.set(firm, target);
  }
  const rows = report.targets.map((target) => {
    const date = validDate(target.publishedAt);
    let reason = '';
    if (!date || date > now) reason = 'Publication date missing or invalid';
    else if (latest.get(target.firm.trim().toLowerCase()) !== target)
      reason = 'Superseded by a newer report';
    else if ((now - date) / 86400000 > days) reason = `Older than ${days} days`;
    else if (!(target.target > 0)) reason = 'No explicit target';
    else if (!target.sourceIds.length) reason = 'No supporting source';
    else if (target.evidenceStatus === 'sources-only')
      reason = 'Sources provided; individual claims not verified';
    else if (target.conflictGroup) reason = 'Conflicting sourced figures';
    else if (/consensus|average|median/i.test(target.firm))
      reason = 'Aggregate estimate, not an individual research firm';
    else if (
      !target.comparable ||
      !target.basis ||
      /^(per share|unknown|unadjusted|adjusted)$/i.test(target.basis.trim()) ||
      target.basis !== report.quote.basis ||
      !target.currency ||
      target.currency !== report.quote.currency
    )
      reason = 'Currency or share basis not confirmed comparable';
    const difference =
      !reason && report.quote.price > 0 ? (target.target / report.quote.price - 1) * 100 : null;
    return { ...target, included: !reason, reason, difference };
  });
  const values = rows
    .filter((row) => row.included)
    .map((row) => row.target)
    .sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return {
    rows,
    count: values.length,
    low: values[0] ?? null,
    high: values.at(-1) ?? null,
    median: values.length
      ? values.length % 2
        ? values[mid]
        : (values[mid - 1] + values[mid]) / 2
      : null,
  };
}

export function cleanReport(input, sources, generatedAt) {
  const report = reportSchema.parse(input);
  // Keep code-owned provenance when a saved report is sanitized on browser reload.
  const provenance = (row, original) => {
    if (['direct', 'claim-mapped', 'sources-only'].includes(original?.evidenceStatus))
      row.evidenceStatus = original.evidenceStatus;
    if (typeof original?.conflictGroup === 'string') row.conflictGroup = original.conflictGroup;
    if (typeof original?.title === 'string') row.title = original.title;
    if (original?.targetOrigin === 'listing') row.targetOrigin = 'listing';
    if (validDate(original?.listedAt) && new Date(original.listedAt) <= new Date(generatedAt))
      row.listedAt = original.listedAt;
  };
  provenance(report.company, input.company);
  provenance(report.quote, input.quote);
  for (const field of ['financials', 'targets', 'metrics'])
    report[field].forEach((row, index) => provenance(row, input[field][index]));
  report.analysis.observations.forEach((row, index) =>
    provenance(row, input.analysis.observations[index]),
  );
  const allowed = new Set(sources.map((source) => source.id));
  function clean(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.sourceIds))
      value.sourceIds = [...new Set(value.sourceIds.filter((id) => allowed.has(id)))];
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(clean);
      else clean(child);
    }
  }
  clean(report);
  const now = new Date(generatedAt);
  const quoteDate = validDate(report.quote.asOf);
  if (
    !report.quote.sourceIds.length ||
    !quoteDate ||
    quoteDate > now ||
    !(report.quote.price > 0)
  ) {
    report.quote.price = null;
    report.quote.changePercent = null;
  }
  const before = report.priceHistory.length;
  report.priceHistory = report.priceHistory
    .filter((point) => {
      const date = validDate(point.date);
      return (
        date &&
        date <= now &&
        point.close > 0 &&
        point.sourceIds.length &&
        point.currency === report.quote.currency &&
        point.basis &&
        point.basis === report.quote.basis
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  report.priceHistory = report.priceHistory.filter(
    (point, index, all) => !index || point.date !== all[index - 1].date,
  );
  report.metrics = report.metrics.filter((metric) => metric.sourceIds.length);
  for (const row of report.financials)
    if (!row.sourceIds.length)
      for (const key of ['revenue', 'netIncome', 'operatingCashFlow', 'netMargin', 'debtEquity'])
        row[key] = null;
  report.financials = report.financials
    .filter((row) => validDate(row.period) && new Date(row.period) <= now)
    .sort((a, b) => a.period.localeCompare(b.period));
  for (const row of report.financials) {
    if (
      row.netMargin !== null &&
      row.revenue > 0 &&
      row.netIncome !== null &&
      Math.abs(row.netMargin - (row.netIncome / row.revenue) * 100) > 0.5
    ) {
      report.limitations.push(
        `Reported net margin for ${row.period} does not reconcile with the reported revenue and net income; profit definitions may differ. The sourced value is retained separately from a calculated margin.`,
      );
    }
  }
  for (const row of report.peers)
    if (!row.sourceIds.length) for (const key of ['pe', 'netMargin', 'debtEquity']) row[key] = null;
  report.news = report.news
    .filter((article) => {
      const date = validDate(article.publishedAt);
      return article.sourceIds.length && (!date || date <= now);
    })
    .sort(
      (a, b) =>
        (validDate(b.publishedAt)?.getTime() ?? 0) - (validDate(a.publishedAt)?.getTime() ?? 0),
    );
  if (before !== report.priceHistory.length)
    report.limitations.push(
      'Price points without valid dates, sources, or a comparable currency/share basis were omitted.',
    );
  return report;
}

export function cashConversion(financials, kind) {
  return financials
    .filter(
      (row) =>
        row.kind === kind &&
        row.netIncome > 0 &&
        row.operatingCashFlow !== null &&
        row.sourceIds.length &&
        ['consolidated', 'standalone'].includes(row.profitBasis) &&
        row.profitBasis === row.cashFlowBasis,
    )
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((row) => ({ ...row, ratio: row.operatingCashFlow / row.netIncome }));
}
