import { safeUrl, validDate } from '../shared/report.js';
import { ResearchError } from './research.js';
import { newsDomains } from '../shared/newsSources.js';
export { newsDomains } from '../shared/newsSources.js';
import { newsDateRange, filterNewsDates } from '../shared/news.js';

const newsCache = new Map();

const allowedNewsUrl = (value) => {
  const url = safeUrl(value);
  if (!url) return '';
  const host = new URL(url).hostname;
  return newsDomains.some((domain) => host === domain || host.endsWith('.' + domain)) ? url : '';
};

function isNewsArticle(url, title) {
  const path = new URL(url).pathname;
  return (
    path !== '/' &&
    !/\/(tags?|topics?|search|hashtag)(\/|\.|$)/i.test(path) &&
    !/tin tức,? bài viết mới nhất|latest news (about|on)|:.*(công ty|company).*\((HOSE|HNX|UPCoM)\)/i.test(
      title,
    )
  );
}

function matchesNewsQuery(article, query) {
  const words = (text) =>
    String(text)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || [];
  const ignored = new Set([
    'cong',
    'ty',
    'co',
    'phan',
    'tap',
    'doan',
    'company',
    'corporation',
    'stock',
    'hose',
    'hsx',
    'hnx',
    'upcom',
  ]);
  const terms = words(query).filter((word) => word.length >= 2 && !ignored.has(word));
  const text = new Set(words(`${article.title} ${article.content || ''}`));
  return terms.length > 0 && terms.every((term) => text.has(term));
}

export async function searchNews({
  query,
  language = 'vi',
  days = 30,
  signal,
  fetcher = fetch,
  now = new Date(),
  cache = fetcher === fetch ? newsCache : new Map(),
}) {
  if (!process.env.TAVILY_API_KEY)
    throw new ResearchError(
      'Tavily is not configured. Add TAVILY_API_KEY to .env and restart the server.',
      503,
    );
  const range = newsDateRange(days, now);
  const cacheKey = `${language}:${query.trim().toLocaleLowerCase()}:${range.endDate}`;
  const previous = cache.get(cacheKey);
  const cached = previous && now.getTime() - previous.time < 15 * 60000 ? previous : null;
  function result(articles, retrievedAt) {
    return {
      query,
      language,
      days,
      ...range,
      provider: 'Tavily',
      scope: 'Selected Vietnamese news publishers',
      processing: 'Tavily search results; original publisher text',
      retrievedAt,
      articles: filterNewsDates(articles, range),
    };
  }
  if (cached?.windows.has(days)) return result(cached.articles, cached.retrievedAt);
  const response = await fetcher('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topic: 'news',
      search_depth: 'basic',
      max_results: 20,
      start_date: range.startDate,
      end_date: range.endDate,
      filter_by_published_date: true,
      language,
      include_domains: newsDomains,
      include_domains_mode: 'restrict',
      include_images: true,
      include_image_descriptions: true,
      include_published_date: true,
      include_answer: false,
      include_raw_content: false,
    }),
    signal,
  });
  if (!response.ok)
    throw new ResearchError(
      [401, 403].includes(response.status)
        ? 'Tavily rejected the API key. Check TAVILY_API_KEY and restart the server.'
        : [429, 432, 433].includes(response.status)
          ? 'Tavily search quota has been reached. Try again later or check your Tavily plan.'
          : 'Tavily news search is unavailable. Please retry.',
      response.status === 429 ? 429 : 502,
    );
  const data = await response.json();
  if (!Array.isArray(data.results))
    throw new ResearchError('Tavily returned an unexpected response. Please retry.');
  const seen = new Set();
  const candidates = data.results.flatMap((item) => {
    const url = allowedNewsUrl(item.url);
    if (
      !url ||
      seen.has(url) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      !isNewsArticle(url, item.title) ||
      !matchesNewsQuery(item, query)
    )
      return [];
    const date = Date.parse(item.published_date);
    const publishedAt = Number.isFinite(date)
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(date))
      : '';
    if (
      !publishedAt ||
      !validDate(publishedAt) ||
      (/^\d{4}-\d{2}-\d{2}/.test(item.published_date) &&
        !validDate(item.published_date.slice(0, 10)))
    )
      return [];
    seen.add(url);
    return [
      {
        title: item.title,
        url,
        publisher: new URL(url).hostname.replace(/^www\./, ''),
        summary: typeof item.content === 'string' ? item.content : '',
        publishedAt,
        // Only images attached to this exact result; query-wide images may be unrelated.
        imageUrl:
          (Array.isArray(item.images) ? item.images : [])
            .map((image) => safeUrl(typeof image === 'string' ? image : image.url))
            .find(Boolean) || '',
      },
    ];
  });
  const dated = filterNewsDates(candidates, range);
  const known = new Map((cached?.articles || []).map((article) => [article.url, article]));
  const articles = dated;
  for (const article of articles) known.set(article.url, article);
  const retrievedAt = now.toISOString();
  if (cache.size >= 100 && !cache.has(cacheKey)) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, {
    time: cached?.time ?? now.getTime(),
    retrievedAt,
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
    sources: [{ id: 'V1', title: `Vietstock · ${ticker} · historical prices`, url }],
  };
  if (fetcher === fetch && points.length) {
    if (historyCache.size >= 100) historyCache.delete(historyCache.keys().next().value);
    historyCache.set(ticker, { time: now.getTime(), result });
  }
  return result;
}
