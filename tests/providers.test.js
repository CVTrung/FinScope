import test from 'node:test';
import assert from 'node:assert/strict';
import { getPriceHistory, parseVietstockHistory } from '../server/providers.js';

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
