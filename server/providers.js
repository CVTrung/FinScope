import { chartStats } from '../shared/prices.js';
import { safeUrl, validDate } from '../shared/report.js';
import { ResearchError } from './research.js';
import { newsDomains } from '../shared/newsSources.js';
export { newsDomains } from '../shared/newsSources.js';
import { newsDateRange, filterNewsDates } from '../shared/news.js';
import {
  matchesNewsQuery,
  buildNewsSearchQuery,
  resolveNewsCompany,
} from '../shared/companyAliases.js';
import { addNewsIntel } from './newsIntel.js';
import { retrieveVietstockNews } from './vietstock.js';
import { newsSearchPlan, newsUrlKey } from '../shared/newsPlan.js';

const newsCache = new Map();

const allowedNewsUrl = (value) => {
  const url = safeUrl(value);
  if (!url) return '';
  const host = new URL(url).hostname;
  return newsDomains.some((domain) => host === domain || host.endsWith('.' + domain)) ? url : '';
};

function isNewsArticle(url, title) {
  const parsed = new URL(url);
  const path = parsed.pathname;
  return (
    parsed.hostname !== 'finance.vietstock.vn' &&
    !/^CW[./]/i.test(title) &&
    path !== '/' &&
    !/\.(pdf|docx?|xlsx?|zip)(?:$|[?#])/i.test(path) &&
    !/\/(tags?|topics?|search|hashtag)(\/|\.|$)/i.test(path) &&
    !/tin tức,? bài viết mới nhất|latest news (about|on)|:.*(công ty|company).*\((HOSE|HNX|UPCoM)\)/i.test(
      title,
    )
  );
}

export async function searchNews({
  query,
  language = 'vi',
  days = 30,
  signal,
  fetcher = fetch,
  now = new Date(),
  cache = fetcher === fetch ? newsCache : new Map(),
  pageFetcher = fetcher === fetch ? fetch : null,
  vietstockNews = fetcher === fetch ? retrieveVietstockNews : null,
}) {
  if (!resolveNewsCompany(query))
    throw new ResearchError('Choose a supported Vietnamese company name or stock ticker.', 400);
  if (!process.env.GOOGLE_NEWS_API_KEY)
    throw new ResearchError(
      'Google News is not configured. Add GOOGLE_NEWS_API_KEY to .env and restart the server.',
      503,
    );
  const range = newsDateRange(days, now);
  const plan = newsSearchPlan(query, range, days);
  const searchQuery = plan[0].query;
  const warnings = [];
  let requests = 0;
  const cacheKey = `${language}:${query.trim().toLocaleLowerCase()}:${range.endDate}`;
  const previous = cache.get(cacheKey);
  const cached = previous && now.getTime() - previous.time < 15 * 60000 ? previous : null;
  function result(articles, retrievedAt) {
    return {
      query,
      searchQuery,
      language,
      days,
      ...range,
      provider: 'Google News',
      scope: 'Selected Vietnamese news publishers',
      processing:
        'Segmented Google News via SerpApi and public Vietstock listings; original publisher text',
      searchSegments: plan.map((item) => item.segment),
      searchRequests: requests,
      warnings: [...new Set([...(cached?.warnings || []), ...warnings])],
      retrievedAt,
      articles: filterNewsDates(articles, range),
    };
  }
  if (cached?.windows.has(days)) return result(cached.articles, cached.retrievedAt);
  const combined = [];
  let successful = 0;
  let lastFailure = null;
  for (const segment of plan) {
    if (signal?.aborted) throw new ResearchError('News search cancelled.', 499);
    const endpoint = new URL('https://serpapi.com/search.json');
    endpoint.search = new URLSearchParams({
      engine: 'google_news',
      q: segment.query,
      gl: 'vn',
      hl: language,
      api_key: process.env.GOOGLE_NEWS_API_KEY,
    });
    try {
      requests++;
      const response = await fetcher(endpoint.toString(), { signal });
      if (!response.ok)
        throw new ResearchError(
          [401, 403].includes(response.status)
            ? 'Google News rejected the API key. Check GOOGLE_NEWS_API_KEY and restart the server.'
            : response.status === 429
              ? 'Google News search quota has been reached. Try again later or check your SerpApi plan.'
              : 'Google News search is unavailable. Please retry.',
          response.status === 429 ? 429 : [401, 403].includes(response.status) ? 503 : 502,
        );
      const data = await response.json();
      const empty =
        typeof data.error === 'string' &&
        /Google.*(?:hasn't|has not|did not).*results/i.test(data.error);
      if (data.error && !empty)
        throw new ResearchError(
          /quota|exceed|run out|out of searches|no searches left/i.test(data.error)
            ? 'Google News search quota has been reached. Try again later or check your SerpApi plan.'
            : 'Google News search is unavailable. Please retry.',
          /quota|exceed|run out|out of searches|no searches left/i.test(data.error) ? 429 : 502,
        );
      if (!empty && !Array.isArray(data.news_results))
        throw new ResearchError('Google News returned an unexpected response. Please retry.');
      successful++;
      combined.push(...(empty ? [] : data.news_results));
    } catch (error) {
      lastFailure = error instanceof ResearchError ? error : null;
      if (signal?.aborted) throw error;
      if (!successful && [429, 503].includes(error.status)) throw error;
      warnings.push('Some news search segments were unavailable. Results may be incomplete.');
      if ([429, 503].includes(error.status)) break;
    }
  }
  if (!successful)
    throw lastFailure || new ResearchError('Google News search is unavailable. Please retry.');
  function flatten(items) {
    return items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      return [
        ...(item.link ? [item] : []),
        ...flatten(Array.isArray(item.stories) ? item.stories : []),
      ];
    });
  }
  const seen = new Set();
  const candidates = flatten(combined).flatMap((item) => {
    const url = allowedNewsUrl(item.link);
    if (
      !url ||
      seen.has(newsUrlKey(url)) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      !isNewsArticle(url, item.title) ||
      !matchesNewsQuery({ title: item.title, content: item.snippet }, query)
    )
      return [];
    const rawDate = typeof item.iso_date === 'string' ? item.iso_date : '';
    const date =
      /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawDate) && validDate(rawDate.slice(0, 10))
        ? Date.parse(rawDate)
        : NaN;
    const publishedAt = Number.isFinite(date)
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(date))
      : '';
    if (
      !publishedAt ||
      !validDate(publishedAt) ||
      publishedAt < range.startDate ||
      publishedAt > range.endDate
    )
      return [];
    seen.add(newsUrlKey(url));
    return [
      {
        title: item.title,
        url,
        publisher: new URL(url).hostname.replace(/^www\./, ''),
        summary: typeof item.snippet === 'string' ? item.snippet : '',
        publishedAt,
        // Only this article's thumbnail; never substitute a publisher logo or cluster image.
        imageUrl: safeUrl(item.thumbnail) || safeUrl(item.thumbnail_small) || '',
      },
    ];
  });
  if (vietstockNews) {
    try {
      const extra = await vietstockNews({ query, signal, now });
      for (const article of filterNewsDates(extra, range)) {
        const url = allowedNewsUrl(article.url);
        if (
          !url ||
          seen.has(newsUrlKey(url)) ||
          !isNewsArticle(url, article.title) ||
          !matchesNewsQuery({ title: article.title, content: article.summary }, query)
        )
          continue;
        seen.add(newsUrlKey(url));
        candidates.push(article);
      }
    } catch {
      if (signal?.aborted) throw new ResearchError('News search cancelled.', 499);
      warnings.push('Supplementary Vietstock news was unavailable.');
    }
  }
  const dated = await addNewsIntel(filterNewsDates(candidates, range), {
    query,
    signal,
    fetcher: pageFetcher,
  });
  const known = new Map(
    (cached?.articles || []).map((article) => [newsUrlKey(article.url), article]),
  );
  const articles = dated;
  for (const article of articles) known.set(newsUrlKey(article.url), article);
  const retrievedAt = now.toISOString();
  if (cache.size >= 100 && !cache.has(cacheKey)) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, {
    time: cached?.time ?? now.getTime(),
    retrievedAt,
    warnings: [...new Set([...(cached?.warnings || []), ...warnings])],
    windows: new Set([...(cached?.windows || []), days]),
    articles: [...known.values()],
  });
  return result([...known.values()], retrievedAt);
}

export function parseVietstockHistory(data, now = new Date()) {
  if (!Array.isArray(data?.data))
    throw new ResearchError('Vietstock returned an unexpected chart response.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  const points = new Map();
  for (const row of data.data) {
    // Vietstock returns either ISO trading dates or ASP.NET milliseconds.
    const ms = /^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(row.TradingDate || '');
    const date = ms
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
          new Date(Number(ms[1])),
        )
      : String(row.TradingDate || '').slice(0, 10);
    const close = row.ClosePrice;
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      validDate(date) &&
      date <= today &&
      typeof close === 'number' &&
      Number.isFinite(close) &&
      close > 0
    )
      points.set(date, {
        date,
        close,
        currency: 'VND',
        basis: 'Vietstock historical close; adjustment basis not disclosed',
        sourceIds: ['V1'],
      });
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const historyCache = new Map();
export async function getPriceHistory({
  ticker,
  exchange,
  signal,
  fetcher = fetch,
  now = new Date(),
}) {
  ticker = String(ticker || '')
    .trim()
    .toUpperCase();
  if (
    !/^[A-Z0-9]{3,10}$/.test(ticker) ||
    !(
      /\b(HOSE|HSX|HNX|UPCOM)\b/i.test(String(exchange || '')) ||
      /Ho Chi Minh|Hanoi|Hà Nội|Hồ Chí Minh/i.test(String(exchange || ''))
    )
  )
    throw new ResearchError(
      'Vietstock history is available for Vietnamese listings on HOSE, HNX, or UPCoM.',
      422,
    );
  const cached = historyCache.get(ticker);
  if (fetcher === fetch && cached && now.getTime() - cached.time < 15 * 60000) return cached.result;
  const url = `https://finance.vietstock.vn/${ticker}.htm`;
  const page = await fetcher(url, { signal });
  if (!page.ok) throw new ResearchError('Vietstock is unavailable. Please retry later.');
  const html = await page.text();
  const input = html.match(/<input\b[^>]*name=["']?__RequestVerificationToken["']?[^>]*>/i)?.[0];
  const token = input
    ?.match(/\bvalue=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    ?.slice(1)
    .find(Boolean);
  if (!token)
    throw new ResearchError(
      'Vietstock did not provide public chart access. Please open the source page or retry later.',
    );
  const cookies = page.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  const response = await fetcher('https://finance.vietstock.vn/data/GetStockDeal_EODChart_ByCode', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Referer: page.url || url,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({
      stockCode: ticker,
      duration: '1Y',
      __RequestVerificationToken: token,
    }),
  });
  if (!response.ok)
    throw new ResearchError('Vietstock historical prices are currently unavailable.');
  const points = parseVietstockHistory(await response.json(), now);
  const result = {
    ticker,
    currency: 'VND',
    provider: 'Vietstock',
    retrievedAt: now.toISOString(),
    basis: 'Vietstock historical close; adjustment basis not disclosed',
    points,
    windowStats: chartStats(points),
    sources: [{ id: 'V1', title: `Vietstock · ${ticker} · historical prices`, url }],
  };
  if (fetcher === fetch && points.length) {
    if (historyCache.size >= 100) historyCache.delete(historyCache.keys().next().value);
    historyCache.set(ticker, { time: now.getTime(), result });
  }
  return result;
}
