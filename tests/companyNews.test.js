import test from 'node:test';
import assert from 'node:assert/strict';
import { recentCompanyNews, previewArticles } from '../src/companyNews.js';

test('sidebar news excludes unrelated/invalid/old articles, deduplicates and sorts newest first', () => {
  const article = (date, url, title = 'FPT company results') => ({ publishedAt: date, url, title });
  const result = previewArticles(
    {
      articles: [
        article('2026-10-01', 'https://vietstock.vn/older'),
        article('2026-10-04', 'https://vietstock.vn/newest'),
        article('2026-10-04', 'https://vietstock.vn/newest'),
        article('2026-08-01', 'https://vietstock.vn/outside'),
        article('2026-10-06', 'https://vietstock.vn/future'),
        article('2026-10-04', 'javascript:alert(1)'),
        article('2026-10-03', 'https://vietstock.vn/other', 'HPG company results'),
        article('2026-02-30', 'https://vietstock.vn/impossible'),
        null,
      ],
    },
    'FPT',
    new Date('2026-10-05T03:00:00Z'),
  );
  assert.deepEqual(
    result.map((row) => row.url),
    ['https://vietstock.vn/newest', 'https://vietstock.vn/older'],
  );
});

test('sidebar requests share in-flight work and cached results; refresh and language request fresh data', async () => {
  let count = 0;
  const bodies = [];
  const fetcher = async (_, options) => {
    count++;
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ articles: [], query: 'FPT (HOSE)' }) };
  };
  const request = () => recentCompanyNews('FPT (HOSE)', 'vi', { fetcher });
  await Promise.all([request(), request()]);
  await request();
  assert.equal(count, 1);
  assert.deepEqual(bodies[0], { query: 'FPT (HOSE)', language: 'vi', days: 30 });
  await recentCompanyNews('FPT (HOSE)', 'vi', { fetcher, refresh: true });
  await recentCompanyNews('FPT (HOSE)', 'en', { fetcher });
  assert.equal(count, 3);
});

test('sidebar errors are not cached, allowing an explicit retry', async () => {
  let count = 0;
  const fetcher = async () => {
    count++;
    return count === 1
      ? {
          ok: false,
          json: async () => ({ error: 'Google News search is unavailable. Please retry.' }),
        }
      : { ok: true, json: async () => ({ articles: [] }) };
  };
  await assert.rejects(recentCompanyNews('HPG', 'vi', { fetcher }), /unavailable/);
  await recentCompanyNews('HPG', 'vi', { fetcher });
  assert.equal(count, 2);
});
