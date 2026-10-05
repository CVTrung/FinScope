import { safeUrl, validDate } from '../shared/report.js';
import { matchesNewsQuery } from '../shared/companyAliases.js';
import { filterNewsDates, newsDateRange } from '../shared/news.js';
import { requestError } from './requestError.js';

const cache = new Map();
const pending = new Map();
const ttl = 15 * 60000;

export function previewArticles(data, query, now = new Date()) {
  const seen = new Set();
  return filterNewsDates(
    data.articles.filter((row) => row && validDate(row.publishedAt)),
    newsDateRange(30, now),
  )
    .filter((row) => {
      const url = safeUrl(row.url);
      if (
        !url ||
        seen.has(url) ||
        !row.title ||
        !matchesNewsQuery({ title: row.title, content: row.summary || '' }, query)
      )
        return false;
      seen.add(url);
      return true;
    })
    .slice(0, 10);
}

export function recentCompanyNews(query, language, { refresh = false, fetcher = fetch } = {}) {
  const key = `finscope-company-news:${language}:${query.trim().toLowerCase()}`;
  let saved = cache.get(key);
  if (!saved) {
    try {
      saved = JSON.parse(sessionStorage.getItem(key));
    } catch {
      /* Optional cache. */
    }
  }
  if (!refresh && saved && Date.now() - saved.at < ttl && Array.isArray(saved.data?.articles))
    return Promise.resolve(saved.data);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {
      const response = await fetcher('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), language, days: 30 }),
        signal: AbortSignal.timeout(155000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Google News search is unavailable. Please retry.');
      if (!Array.isArray(data.articles))
        throw new Error('Google News returned an unexpected response. Please retry.');
      const value = { at: Date.now(), data };
      if (cache.size >= 20) cache.delete(cache.keys().next().value);
      cache.set(key, value);
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* Optional cache. */
      }
      return data;
    } catch (error) {
      throw new Error(requestError(error));
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}
