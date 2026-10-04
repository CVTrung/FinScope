import { newsDomains } from './newsSources.js';
import { buildNewsSearchQuery } from './companyAliases.js';

export function newsSearchPlan(query, range, days) {
  const before = new Date(`${range.endDate}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() + 1);
  const start = new Date(`${range.startDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const aliases = buildNewsSearchQuery(query);
  const sites = `(${newsDomains.map((domain) => `site:${domain}`).join(' OR ')}) -site:finance.vietstock.vn`;
  const dates = `after:${start.toISOString().slice(0, 10)} before:${before.toISOString().slice(0, 10)}`;
  const plan = [
    { segment: 'General coverage', query: `${aliases} ${sites} ${dates}` },
    {
      segment: 'Financial results',
      query: `${aliases} ("kết quả kinh doanh" OR "lợi nhuận" OR "doanh thu" OR "financial results" OR earnings) ${sites} ${dates}`,
    },
    {
      segment: 'Corporate actions',
      query: `${aliases} ("cổ tức" OR "phát hành" OR "đại hội" OR "dự án" OR dividend OR investment) ${sites} ${dates}`,
    },
  ];
  if (days > 30) {
    const split = new Date(`${range.endDate}T00:00:00Z`);
    split.setUTCDate(split.getUTCDate() - Math.floor(days / 2) + 1);
    plan.push({
      segment: 'Earlier coverage',
      query: `${aliases} ${sites} after:${start.toISOString().slice(0, 10)} before:${split.toISOString().slice(0, 10)}`,
    });
  } else
    plan.push({
      segment: 'Vietstock coverage',
      query: `${aliases} site:vietstock.vn -site:finance.vietstock.vn ${dates}`,
    });
  return plan;
}

export function newsUrlKey(value) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
