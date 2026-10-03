export const newsWindows = [
  { days: 1, label: 'Today' },
  { days: 3, label: 'Last 3 days' },
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, months: 3, label: 'Last 3 months' },
  { days: 180, months: 6, label: 'Last 6 months' },
  { days: 365, months: 12, label: 'Last 12 months' },
  { days: 730, months: 24, label: 'Last 24 months' },
];

export function newsDateRange(days, now = new Date()) {
  const window = newsWindows.find((item) => item.days === days);
  if (!window) throw new Error('Unsupported news publication window.');
  const endDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(now);
  const start = new Date(`${endDate}T00:00:00Z`);
  if (window.months) {
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - window.months);
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    start.setUTCDate(Math.min(day, lastDay));
  } else start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export function filterNewsDates(articles, { startDate, endDate }) {
  return articles
    .filter(
      (article) =>
        article.publishedAt && article.publishedAt >= startDate && article.publishedAt <= endDate,
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url));
}
