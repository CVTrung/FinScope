import { safeUrl } from '../shared/report.js';
import { newsDomains } from '../shared/newsSources.js';
import { matchesNewsQuery } from '../shared/companyAliases.js';

function allowedPage(value) {
  const safe = safeUrl(value);
  if (!safe) return '';
  const host = new URL(safe).hostname;
  return newsDomains.some((domain) => host === domain || host.endsWith('.' + domain)) ? safe : '';
}

function decode(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(amp|quot|apos|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi, (match, key) => {
    if (!key.startsWith('#')) return entities[key.toLowerCase()] || match;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function excerpt(value) {
  if (typeof value !== 'string') return '';
  const text = decode(value)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 320) return text;
  const short = text.slice(0, 317);
  return short.slice(0, short.lastIndexOf(' ') > 240 ? short.lastIndexOf(' ') : short.length) + '…';
}

export function pageDescription(html) {
  const descriptions = new Map();
  for (const tag of String(html)
    .slice(0, 256000)
    .match(/<meta\b[^>]*>/gi) || []) {
    const attributes = new Map();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3]);
    const name = (attributes.get('property') || attributes.get('name') || '').toLowerCase();
    if (['og:description', 'description', 'twitter:description'].includes(name))
      descriptions.set(name, excerpt(attributes.get('content')));
  }
  return (
    descriptions.get('og:description') ||
    descriptions.get('description') ||
    descriptions.get('twitter:description') ||
    ''
  );
}

export async function addNewsIntel(articles, { query, signal, fetcher }) {
  const normalized = articles.map((article) => ({ ...article, summary: excerpt(article.summary) }));
  if (!fetcher) return normalized;
  // Only the first eight missing excerpts, four at a time: bounded work and no extra search credits.
  const missing = normalized.filter((article) => !article.summary).slice(0, 8);
  for (let index = 0; index < missing.length; index += 4) {
    await Promise.all(
      missing.slice(index, index + 4).map(async (article) => {
        const url = allowedPage(article.url);
        if (!url) return;
        try {
          const timeout = AbortSignal.timeout(5000);
          const response = await fetcher(url, {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
          if (!response.ok || (response.url && !allowedPage(response.url))) return;
          const text = pageDescription(await response.text());
          if (
            text &&
            text !== article.title &&
            (!query || matchesNewsQuery({ content: text }, query))
          )
            article.summary = text;
        } catch {
          // Missing/blocked page descriptions must not discard valid Google News articles.
        }
      }),
    );
  }
  return normalized;
}
