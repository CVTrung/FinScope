import test from 'node:test';
import assert from 'node:assert/strict';
import { newsDateRange, filterNewsDates } from '../shared/news.js';
import { searchNews } from '../server/providers.js';

test('news windows use Vietnam dates, inclusive days, and calendar months with clamped month ends', () => {
  assert.deepEqual(newsDateRange(7, new Date('2026-10-02T18:00:00Z')), {
    startDate: '2026-09-27',
    endDate: '2026-10-03',
  });
  assert.deepEqual(newsDateRange(90, new Date('2026-05-31T08:00:00Z')), {
    startDate: '2026-02-28',
    endDate: '2026-05-31',
  });
  assert.equal(newsDateRange(730, new Date('2024-02-29T08:00:00Z')).startDate, '2022-02-28');
  assert.throws(() => newsDateRange(999), /Unsupported/);
});

test('date filtering removes unknown, future and out-of-window news and sorts newest first', () => {
  const articles = ['2026-09-27', '', '2026-10-04', '2026-09-26', '2026-10-02'].map(
    (publishedAt, i) => ({ publishedAt, url: String(i) }),
  );
  assert.deepEqual(
    filterNewsDates(articles, newsDateRange(7, new Date('2026-10-03'))).map((a) => a.publishedAt),
    ['2026-10-02', '2026-09-27'],
  );
  assert.equal(articles[0].publishedAt, '2026-09-27');
});

test('wider ranked searches retain known recent articles and repeated windows reuse the cache', async () => {
  const key = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'test-key';
  const cache = new Map();
  const requests = [];
  const dates = ['2026-10-01', '2026-09-15', '2026-04-02'];
  const fetcher = async (url, options) => {
    if (url !== 'https://api.tavily.com/search') return new Response('', { status: 404 });
    requests.push(JSON.parse(options.body));
    const index = requests.length - 1;
    return Response.json({
      results: [
        {
          title: `FPT ${index}`,
          url: `https://cafef.vn/story-${index}`,
          content: 'FPT Vietnam',
          published_date: dates[index],
        },
        { title: 'Undated', url: 'https://cafef.vn/unknown', content: 'FPT Vietnam' },
        { title: 'Future', url: 'https://cafef.vn/future', published_date: '2026-10-04' },
        { title: 'Old', url: 'https://cafef.vn/old', published_date: '2023-01-01' },
        { title: 'Invalid', url: 'https://cafef.vn/invalid', published_date: '2026-02-30' },
      ],
    });
  };
  const search = (days, now = new Date('2026-10-03T08:00:00Z')) =>
    searchNews({
      query: 'FPT',
      language: 'vi',
      days,
      now,
      fetcher,
      cache,
    });
  try {
    const week = await search(7);
    const month = await search(30);
    const year = await search(365);
    assert.deepEqual(
      week.articles.map((a) => a.publishedAt),
      dates.slice(0, 1),
    );
    assert.deepEqual(
      month.articles.map((a) => a.publishedAt),
      dates.slice(0, 2),
    );
    assert.deepEqual(
      year.articles.map((a) => a.publishedAt),
      dates,
    );
    assert.deepEqual((await search(7)).articles, week.articles);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].start_date, '2025-10-03');
    assert.equal(requests[0].max_results, 20);
  } finally {
    if (key === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = key;
  }
});

test('news state restores the query, time window and complete results after remount or reload', async () => {
  const previous = globalThis.sessionStorage;
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  try {
    const state = {
      query: 'FPT',
      days: 7,
      result: { query: 'FPT', days: 7, language: 'vi', articles: [{ title: 'FPT news' }] },
    };
    const first = await import('../src/newsState.js?first');
    first.saveNewsState(state);
    assert.deepEqual(first.loadNewsState(), state);
    const reloaded = await import('../src/newsState.js?reloaded');
    assert.deepEqual(reloaded.loadNewsState(), state);
  } finally {
    if (previous === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previous;
  }
});
