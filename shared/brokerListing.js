import { safeUrl } from './report.js';

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
export function listingTarget(title, ticker) {
  const text = normalize(title);
  if (!ticker || !text.split(/[^a-z0-9]+/).includes(ticker.toLowerCase())) return null;
  const match =
    /(?:gia muc tieu|target price|price target)\s*(?:[:=]|la|of)?\s*([\d]+(?:[.,]\d+)*)\s*(vnd|dong|₫|usd)?/.exec(
      text,
    );
  if (!match) return null;
  const token = match[1];
  const value = /^\d{1,3}(?:[.,]\d{3})+$/.test(token)
    ? Number(token.replace(/[.,]/g, ''))
    : Number(token.replace(',', '.'));
  if (!(value > 0) || !Number.isFinite(value)) return null;
  return {
    target: value,
    currency: /vnd|dong|₫/.test(match[2] || '') ? 'VND' : match[2] === 'usd' ? 'USD' : '',
  };
}

// Reuse public listing text for saved reports as well as fresh backend results.
export function enrichListingTargets(report) {
  return report.targets.map((row) => {
    const hasTarget = Number.isFinite(row.target) && row.target > 0;
    if (hasTarget && row.publishedAt && row.currency && row.targetOrigin !== 'listing') return row;
    for (const id of row.sourceIds) {
      const source = report.sources.find((source) => source.id === id && safeUrl(source.url));
      if (!source) continue;
      const host = new URL(source.url).hostname;
      if (host !== 'vietstock.vn' && !host.endsWith('.vietstock.vn')) continue;
      const price = listingTarget(row.title || source.title, report.company.ticker);
      if (price && (!hasTarget || price.target === row.target))
        return { ...row, ...price, targetOrigin: 'listing', comparable: false, basis: '' };
    }
    return row;
  });
}

export function targetReasoning(row) {
  return [
    ['Thesis', row.thesis],
    ['Valuation assumptions', row.assumptions],
    ['Risks', row.risks],
  ].filter(
    ([, value]) =>
      typeof value === 'string' &&
      value.trim() &&
      !/^(n\/?a|unknown|not (?:available|disclosed)|chưa có dữ liệu|không được công bố)$/i.test(
        value.trim(),
      ),
  );
}
