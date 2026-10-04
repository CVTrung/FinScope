import test from 'node:test';
import assert from 'node:assert/strict';
import { addNewsIntel, pageDescription } from '../server/newsIntel.js';

const articles = [
  { url: 'https://cafef.vn/hpg-story.chn', title: 'Hòa Phát invests', summary: '' },
  {
    url: 'https://vietstock.vn/2026/10/hpg-other.htm',
    title: 'HPG results',
    summary: 'Original source excerpt.',
  },
  { url: 'https://cafef.vn/hpg-third.chn', title: 'HPG announcement', summary: '' },
];

test('source descriptions handle attribute order, HTML entities and short text without inventing summaries', () => {
  assert.equal(
    pageDescription('<meta content="Hòa Phát đầu tư &amp; mở rộng." property="og:description">'),
    'Hòa Phát đầu tư & mở rộng.',
  );
  assert.equal(
    pageDescription("<meta name='description' content='HPG reports profit.'>"),
    'HPG reports profit.',
  );
  assert.equal(pageDescription('<title>Headline only</title>'), '');
  assert.ok(
    pageDescription(`<meta name="description" content="${'HPG word '.repeat(100)}">`).length <= 320,
  );
});

test('intel reads only each exact allowed article, preserves source excerpts and rejects unrelated page descriptions', async () => {
  const calls = [];
  const result = await addNewsIntel(articles, {
    query: 'HPG',
    fetcher: async (url) => {
      calls.push(url);
      return new Response(
        url === articles[0].url
          ? '<meta property="og:description" content="Hòa Phát góp vốn vào dự án mới.">'
          : '<meta name="description" content="Generic newspaper home page">',
      );
    },
  });
  assert.deepEqual(calls, [articles[0].url, articles[2].url]);
  assert.equal(result[0].summary, 'Hòa Phát góp vốn vào dự án mới.');
  assert.equal(result[1].summary, 'Original source excerpt.');
  assert.equal(result[2].summary, '');
  assert.equal(articles[0].summary, '');
});

test('intel page failures and outside publishers remain optional without discarding news', async () => {
  for (const fetcher of [
    async () => new Response('', { status: 403 }),
    async () => {
      throw new Error('offline');
    },
    async () => new Response('<title>No description</title>'),
  ])
    assert.deepEqual(await addNewsIntel(articles, { fetcher }), articles);
  const outside = [{ url: 'https://example.com/news', title: 'HPG', summary: '' }];
  assert.deepEqual(await addNewsIntel(outside, { fetcher: () => assert.fail() }), outside);
});
