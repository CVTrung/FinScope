import { safeUrl, validDate, summarizeTargets } from '../shared/report.js';
import { reportView } from './reportView.js';

export function valuationView(report, days = 365) {
  const sourceIds = new Set(report.sources.filter((s) => safeUrl(s.url)).map((s) => s.id));
  const quote = reportView(report).quote;
  // Keep missing targets in the input: a newer report can supersede an older target.
  const targets = report.targets.map((row) => ({
    ...row,
    sourceIds: row.sourceIds.filter((id) => sourceIds.has(id)),
    target: Number.isFinite(row.target) && row.target > 0 ? row.target : null,
  }));
  const summary = summarizeTargets(
    { ...report, targets, quote: quote || { ...report.quote, price: null } },
    days,
  );
  const now = new Date(report.generatedAt);
  const rows = summary.rows
    .filter((row) => {
      const date = validDate(row.publishedAt);
      return row.firm.trim() && row.sourceIds.length && (!row.publishedAt || (date && date <= now));
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const included = rows.filter((row) => row.included);
  const mean = included.length
    ? included.reduce((sum, row) => sum + row.target, 0) / included.length
    : null;
  return {
    ...summary,
    rows,
    quote,
    mean,
    upside: mean !== null && quote ? (mean / quote.price - 1) * 100 : null,
    spread: summary.count ? summary.high - summary.low : null,
    latest: included[0] || null,
  };
}
