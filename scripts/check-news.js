import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { searchNews, newsDomains } from '../server/providers.js';
import { matchesNewsQuery } from '../shared/companyAliases.js';

// Real SerpApi calls; artifacts never contain the credential URL.
const checks = [];
const cache = new Map();
for (const [query, days, language] of [
  ['HPG', 7, 'vi'],
  ['HPG', 30, 'vi'],
  ['VNM', 365, 'en'],
]) {
  let rawCount;
  const result = await searchNews({
    query,
    days,
    language,
    cache,
    pageFetcher: fetch,
    signal: AbortSignal.timeout(60000),
    fetcher: async (url, options) => {
      const request = new URL(url);
      assert.equal(request.hostname, 'serpapi.com');
      assert.equal(request.searchParams.get('engine'), 'google_news');
      assert.equal(request.searchParams.get('gl'), 'vn');
      assert.equal(request.searchParams.get('hl'), language);
      const response = await fetch(url, options);
      if (response.ok) rawCount = (await response.clone().json()).news_results?.length || 0;
      return response;
    },
  });
  const urls = new Set();
  for (const [index, article] of result.articles.entries()) {
    const host = new URL(article.url).hostname;
    assert.ok(newsDomains.some((domain) => host === domain || host.endsWith('.' + domain)));
    assert.ok(article.publishedAt >= result.startDate && article.publishedAt <= result.endDate);
    assert.ok(matchesNewsQuery({ title: article.title, content: article.summary }, query));
    assert.ok(!urls.has(article.url));
    urls.add(article.url);
    if (index) assert.ok(result.articles[index - 1].publishedAt >= article.publishedAt);
  }
  checks.push({ query, days, language, rawCount, result });
  console.log(
    JSON.stringify({
      query,
      days,
      language,
      rawCount,
      retained: result.articles.length,
      images: result.articles.filter((a) => a.imageUrl).length,
      excerpts: result.articles.filter((a) => a.summary).length,
      titles: result.articles.slice(0, 3).map((a) => a.title),
    }),
  );
}
for (const article of checks[0].result.articles)
  assert.ok(
    checks[1].result.articles.some((a) => a.url === article.url),
    'Widening must keep confirmed recent stories',
  );
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/live-google-news.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2),
);
assert.ok(
  checks.some((check) => check.result.articles.length),
  'No qualifying live stories; inspect the artifact.',
);
console.log('Live Google News domain/date/company/order/duplicate/cache checks passed.');
