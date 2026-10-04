import { validDate } from './report.js';

export const priceRanges = ['1W', '1M', '3M', '6M', '1Y'];

// Anchor to the latest trading observation, so weekends do not shorten the visible series.
export function priceWindow(points, range = '1Y') {
  const dated = points
    .filter((point) => validDate(point.date) && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!dated.length) return [];
  const end = new Date(dated.at(-1).date);
  const start = new Date(end);
  if (range === '1W') start.setUTCDate(start.getUTCDate() - 6);
  else {
    const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range] || 12;
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - months);
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    start.setUTCDate(Math.min(day, lastDay));
  }
  return dated.filter((point) => new Date(point.date) >= start);
}

export function chartStats(points) {
  return Object.fromEntries(
    priceRanges.map((range) => {
      const rows = priceWindow(points, range),
        first = rows[0],
        last = rows.at(-1);
      return [
        range,
        {
          count: rows.length,
          firstDate: first?.date || '',
          lastDate: last?.date || '',
          latestClose: last?.close ?? null,
          low: rows.length ? Math.min(...rows.map((row) => row.close)) : null,
          high: rows.length ? Math.max(...rows.map((row) => row.close)) : null,
          changePercent: rows.length > 1 ? (last.close / first.close - 1) * 100 : null,
        },
      ];
    }),
  );
}
