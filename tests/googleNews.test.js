import test from 'node:test';
import assert from 'node:assert/strict';
import { searchNews, newsDomains } from '../server/providers.js';

function article(title, link, iso_date = '2026-10-02T08:00:00Z', extra = {}) {
  return { title, link, iso_date, ...extra };
}

async function withKey(run) {
  const before = process.env.GOOGLE_NEWS_API_KEY;
  process.env.GOOGLE_NEWS_API_KEY = 'test-key';
  try {
    await run();
  } finally {
    if (before === undefined) delete process.env.GOOGLE_NEWS_API_KEY;
    else process.env.GOOGLE_NEWS_API_KEY = before;
  }
}

test('Google News uses SerpApi with Vietnam, selected language, alias OR search and inclusive date bounds', async () => {
  await withKey(async () => {
    const requests = [];
    const result = await searchNews({
      query: 'HPG',
      language: 'en',
      days: 7,
      now: new Date('2026-10-03T08:00:00Z'),
      fetcher: async (url) => {
        requests.push(new URL(url));
        return Response.json({
          news_results: [article('Hòa Phát tăng doanh thu', 'https://cafef.vn/hoa-phat.htm')],
        });
      },
    });
    const request = requests[0];
    assert.equal(requests.length, 4);
    assert.equal(request.origin + request.pathname, 'https://serpapi.com/search.json');
    assert.equal(request.searchParams.get('api_key'), 'test-key');
    assert.equal(request.searchParams.get('engine'), 'google_news');
    assert.equal(request.searchParams.get('gl'), 'vn');
    assert.equal(request.searchParams.get('hl'), 'en');
    assert.ok(request.searchParams.get('q').startsWith('(HPG OR "Hòa Phát")'));
    for (const domain of newsDomains)
      assert.ok(request.searchParams.get('q').includes(`site:${domain}`));
    assert.ok(request.searchParams.get('q').endsWith('after:2026-09-26 before:2026-10-04'));
    assert.equal(result.provider, 'Google News');
    assert.equal(result.query, 'HPG');
    assert.equal(result.searchQuery, request.searchParams.get('q'));
    assert.equal(result.articles.length, 1);
  });
});

test('Google News flattens story groups and rejects unrelated, unsafe, undated and out-of-range articles', async () => {
  await withKey(async () => {
    const result = await searchNews({
      query: 'HPG',
      days: 7,
      now: new Date('2026-10-03T08:00:00Z'),
      fetcher: async () =>
        Response.json({
          news_results: [
            {
              title: 'Group',
              thumbnail: 'https://cdn.test/unrelated.jpg',
              stories: [
                article('Hòa Phát tăng doanh thu', 'https://cafef.vn/story.htm', '2026-10-01', {
                  snippet: 'Original excerpt 12.5%',
                  thumbnail: 'https://cdn.test/hpg.jpg',
                }),
                article(
                  'HPG tăng giá',
                  'https://www.vietstock.vn/hpg.htm',
                  '2026-10-02T18:30:00Z',
                  { thumbnail: 'javascript:bad', thumbnail_small: 'https://cdn.test/small.jpg' },
                ),
                article('Duplicate HPG', 'https://cafef.vn/story.htm'),
              ],
            },
            article('HPG', 'https://example.com/story'),
            article('HPG', 'https://cafef.vn.evil.test/story'),
            article('HPG', 'javascript:alert(1)'),
            article('HPG', 'https://cafef.vn/'),
            article('HPG', 'https://cafef.vn/tags/hpg'),
            article('HPG fund disclosure', 'https://static2.vietstock.vn/reports/hpg.pdf'),
            article('Vinamilk profit', 'https://cafef.vn/unrelated'),
            article('HPG123 profit', 'https://cafef.vn/partial'),
            article(
              'CW.HPG.6M.SSV HOSE: CHPG2631',
              'https://finance.vietstock.vn/derivatives/CHPG2631/cw-issuer.htm',
            ),
            article('HPG profile', 'https://finance.vietstock.vn/HPG.htm'),
            article('HPG undated', 'https://cafef.vn/undated', '', { date: '2 hours ago' }),
            article('HPG invalid', 'https://cafef.vn/invalid', '2026-02-30'),
            article('HPG old', 'https://cafef.vn/old', '2026-09-26'),
            article('HPG future', 'https://cafef.vn/future', '2026-10-04'),
            article('Old HPG version', 'https://cafef.vn/updated.htm', '2026-09-01'),
            article('HPG updated disclosure', 'https://cafef.vn/updated.htm', '2026-09-27'),
            null,
          ],
        }),
    });
    assert.deepEqual(
      result.articles.map((a) => a.publishedAt),
      ['2026-10-03', '2026-10-01', '2026-09-27'],
    );
    assert.equal(result.articles[0].imageUrl, 'https://cdn.test/small.jpg');
    assert.equal(result.articles[1].summary, 'Original excerpt 12.5%');
    assert.equal(result.articles[1].imageUrl, 'https://cdn.test/hpg.jpg');
    assert.equal(result.articles[1].publisher, 'cafef.vn');
  });
});

test('Google News handles empty searches, absent images/excerpts and never needs Gemini', async () => {
  await withKey(async () => {
    const before = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const result = await searchNews({
        query: 'FPT',
        now: new Date('2026-10-03'),
        fetcher: async (url) => {
          assert.equal(new URL(url).hostname, 'serpapi.com');
          return Response.json({
            news_results: [article('FPT results', 'https://cafef.vn/fpt.htm')],
          });
        },
      });
      assert.equal(result.articles[0].summary, '');
      assert.equal(result.articles[0].imageUrl, '');
      const empty = await searchNews({
        query: 'FPT',
        fetcher: async () =>
          Response.json({ error: "Google hasn't returned any results for this query." }),
      });
      assert.deepEqual(empty.articles, []);
    } finally {
      if (before === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = before;
    }
  });
});

test('Google News gives actionable errors without exposing raw response or keys', async () => {
  await withKey(async () => {
    for (const [status, message] of [
      [401, /rejected the API key/],
      [403, /rejected the API key/],
      [429, /quota/],
      [500, /unavailable/],
    ]) {
      await assert.rejects(
        () =>
          searchNews({
            query: 'FPT',
            fetcher: async () => new Response('secret provider payload', { status }),
          }),
        message,
      );
    }
    await assert.rejects(
      () =>
        searchNews({
          query: 'FPT',
          fetcher: async () => Response.json({ error: 'secret provider payload' }),
        }),
      /unavailable/,
    );
    await assert.rejects(
      () => searchNews({ query: 'FPT', fetcher: async () => Response.json({ bad: [] }) }),
      /unexpected response/,
    );
  });
  const before = process.env.GOOGLE_NEWS_API_KEY;
  delete process.env.GOOGLE_NEWS_API_KEY;
  try {
    await assert.rejects(
      () => searchNews({ query: 'FPT', fetcher: () => assert.fail() }),
      /GOOGLE_NEWS_API_KEY/,
    );
  } finally {
    if (before !== undefined) process.env.GOOGLE_NEWS_API_KEY = before;
  }
});
