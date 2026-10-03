import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPriceHistory,
  parseVietstockHistory,
  searchNews,
  newsDomains,
} from '../server/providers.js';

test('Vietstock adapter opens a public session then requests one year of actual closes', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, ...options });
    if (calls.length === 1)
      return new Response(
        '<input name=__RequestVerificationToken type=hidden value=public-token>',
        { headers: { 'set-cookie': 'session=public; Path=/' } },
      );
    return Response.json({ data: [{ TradingDate: '2026-10-02T00:00:00', ClosePrice: 62100 }] });
  };
  const result = await getPriceHistory({
    ticker: 'fpt',
    exchange: 'Ho Chi Minh Stock Exchange (HOSE)',
    fetcher,
    now: new Date('2026-10-03'),
  });
  assert.equal(result.points[0].close, 62100); // Whole VND, no guessed multiplier.
  assert.equal(result.sources[0].url, 'https://finance.vietstock.vn/FPT.htm');
  assert.equal(calls[1].body.get('duration'), '1Y');
  assert.equal(calls[1].body.get('__RequestVerificationToken'), 'public-token');
  assert.equal(calls[1].headers.Cookie, 'session=public');
});
test('history keeps real dated positive prices sorted and does not invent gaps', () => {
  const points = parseVietstockHistory(
    {
      data: [
        { TradingDate: '2026-10-02T00:00:00', ClosePrice: 62100 },
        { TradingDate: '/Date(1790816400000)/', ClosePrice: 61000 },
        { TradingDate: '2026-10-02', ClosePrice: 62000 },
        { TradingDate: '2026-10-04', ClosePrice: 99999 },
        { TradingDate: '2026-10-01', ClosePrice: null },
        { TradingDate: 'bad', ClosePrice: 80000 },
      ],
    },
    new Date('2026-10-03'),
  );
  assert.equal(points.length, 2);
  assert.equal(points[1].close, 62000);
  assert.ok(points[0].date < points[1].date);
});
test('unsupported listings and inaccessible charts fail without alternative providers', async () => {
  await assert.rejects(
    () => getPriceHistory({ ticker: 'AAPL', exchange: 'NASDAQ', fetcher: () => assert.fail() }),
    /Vietnamese listings/,
  );
  await assert.rejects(
    () =>
      getPriceHistory({
        ticker: 'FPT',
        exchange: 'HOSE',
        fetcher: async () => new Response('Login required'),
      }),
    /public chart access/,
  );
  assert.throws(() => parseVietstockHistory({ error: 'access' }), /unexpected chart/);
});
test('Tavily news is independent, sends server key and normalizes sources without inventing dates', async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'test-key';
  try {
    let request;
    const result = await searchNews({
      query: 'FPT',
      days: 7,
      now: new Date('2026-10-03T08:00:00Z'),
      fetcher: async (url, options) => {
        if (url === 'https://api.tavily.com/search') request = { url, ...options };
        if (url !== 'https://api.tavily.com/search') return new Response('', { status: 404 });
        return Response.json({
          results: [
            {
              title: 'FPT news',
              url: 'https://cafef.vn/story',
              content: 'Excerpt',
              published_date: 'Fri, 02 Oct 2026 07:00:00 GMT',
            },
            { title: 'Duplicate', url: 'https://cafef.vn/story' },
            { title: 'Unknown date', url: 'https://cafef.vn/other' },
            { title: 'Unsafe', url: 'javascript:alert(1)' },
            {
              title: 'Outside domain list',
              url: 'https://example.com/news',
              published_date: '2026-10-02',
            },
            {
              title: 'Fake subdomain',
              url: 'https://cafef.vn.evil.test/news',
              published_date: '2026-10-02',
            },
            { title: 'Tag page', url: 'https://cafef.vn/tags/fpt', published_date: '2026-10-02' },
            {
              title: 'Unrelated company',
              content: 'Different company reports profits.',
              url: 'https://cafef.vn/other-company',
              published_date: '2026-10-02',
            },
          ],
        });
      },
    });
    assert.equal(request.url, 'https://api.tavily.com/search');
    assert.equal(request.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(request.body).language, 'vi');
    assert.equal(JSON.parse(request.body).topic, 'news');
    assert.equal(JSON.parse(request.body).query, 'FPT');
    assert.ok(JSON.parse(request.body).include_domains.includes('vietstock.vn'));
    assert.equal(JSON.parse(request.body).include_domains_mode, 'restrict');
    assert.equal(JSON.parse(request.body).filter_by_language, undefined);
    assert.deepEqual(JSON.parse(request.body).include_domains, newsDomains);
    assert.equal(new Set(newsDomains).size, newsDomains.length);
    assert.ok(newsDomains.length >= 40);
    assert.equal(JSON.parse(request.body).include_images, true);
    assert.equal(JSON.parse(request.body).start_date, '2026-09-27');
    assert.equal(JSON.parse(request.body).end_date, '2026-10-03');
    assert.equal(JSON.parse(request.body).filter_by_published_date, true);
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].publishedAt, '2026-10-02');
    await assert.rejects(
      () =>
        searchNews({
          query: 'FPT',
          fetcher: async () => new Response('private details', { status: 401 }),
        }),
      /rejected the API key/,
    );
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test('news calls only Tavily without any Gemini key, preserving source text and per-result images', async () => {
  const before = {
    tavily: process.env.TAVILY_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };
  process.env.TAVILY_API_KEY = 'test-key';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const calls = [];
  try {
    const result = await searchNews({
      query: 'FPT',
      language: 'en',
      days: 7,
      now: new Date('2026-10-03T08:00:00Z'),
      fetcher: async (url, options) => {
        assert.equal(url, 'https://api.tavily.com/search');
        calls.push(JSON.parse(options.body));
        return Response.json({
          images: [{ url: 'https://cdn.test/unrelated.jpg' }],
          results: [
            {
              title: 'FPT reports results',
              content: 'Original source excerpt with 12.5%.',
              url: 'https://news.tuoitre.vn/fpt-results.htm',
              published_date: '2026-10-02',
              images: [{ url: 'https://cdn.test/fpt.jpg' }],
            },
            {
              title: 'FPT invests',
              content: 'Original second excerpt',
              url: 'https://vir.com.vn/fpt-invests.html',
              published_date: '2026-10-01',
            },
          ],
        });
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].language, 'en');
    assert.equal(result.articles[0].title, 'FPT reports results');
    assert.equal(result.articles[0].summary, 'Original source excerpt with 12.5%.');
    assert.equal(result.articles[0].imageUrl, 'https://cdn.test/fpt.jpg');
    assert.equal(result.articles[1].imageUrl, '');
    assert.equal(result.provider, 'Tavily');
  } finally {
    for (const [name, value] of [
      ['TAVILY_API_KEY', before.tavily],
      ['GEMINI_API_KEY', before.gemini],
      ['GOOGLE_API_KEY', before.google],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
