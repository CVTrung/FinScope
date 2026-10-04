import { safeUrl, validDate } from '../shared/report.js';
import { combineFinancials } from '../shared/evidence.js';

export const financialFields = [
  ['Revenue', 'revenue', ''],
  ['Net income', 'netIncome', ''],
  ['Operating cash flow', 'operatingCashFlow', ''],
  ['Net margin', 'netMargin', '%'],
  ['Debt / equity', 'debtEquity', '×'],
];

// Display availability means usable, sourced data, not an independent verification of the claim.
export function reportView(report) {
  const sources = new Set(
    report.sources.filter((source) => safeUrl(source.url)).map((source) => source.id),
  );
  const sourced = (row) => row.sourceIds?.some((id) => sources.has(id));
  const dated = (date) => validDate(date) && new Date(date) <= new Date(report.generatedAt);
  const financials = combineFinancials(report.financials, report.sources).financials.filter(
    (row) =>
      !row.isAlternative &&
      sourced(row) &&
      dated(row.period) &&
      financialFields.some(([, key]) => Number.isFinite(row[key])),
  );
  const observations = report.analysis.observations.filter(
    (row) => sourced(row) && row.title.trim() && row.detail.trim(),
  );
  const targets = report.targets.filter(
    (row) =>
      sourced(row) &&
      (!row.publishedAt || dated(row.publishedAt)) &&
      row.firm.trim() &&
      (row.target === null || row.target > 0),
  );
  const quote =
    sourced(report.quote) &&
    report.quote.price > 0 &&
    report.quote.currency.trim() &&
    dated(report.quote.asOf)
      ? report.quote
      : null;
  const profile = sourced(report.company) && Boolean(report.company.description.trim());
  const coverage = [
    {
      label: 'Company profile',
      available: profile,
      reason: 'A sourced company description was not returned.',
    },
    {
      label: 'Dated stock price',
      available: Boolean(quote),
      reason: 'No stock price with a date, currency and supporting source.',
    },
    {
      label: 'Financial statements',
      available: financials.length > 0,
      reason: 'No financial figures with a source and period.',
    },
    {
      label: 'Research observations',
      available: observations.length > 0,
      reason: 'No observations with supporting sources.',
    },
    {
      label: 'Broker research reports',
      available: targets.length > 0,
      reason: 'No broker reports with an identified firm and source.',
    },
  ];
  return { profile, quote, financials, observations, targets, coverage };
}
