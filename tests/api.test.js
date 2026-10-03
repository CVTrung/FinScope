import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function withServer(research, run) {
  const server = createApp({ research }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test('API validates input, handles malformed JSON, and rejects missing API routes', async () => {
  await withServer(
    () => assert.fail('Research must not run'),
    async (base) => {
      for (const query of ['', 'X', 123, 'x'.repeat(201)]) {
        const response = await fetch(`${base}/api/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        assert.equal(response.status, 400);
      }
      const malformed = await fetch(`${base}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });
      assert.equal(malformed.status, 400);
      assert.equal((await fetch(`${base}/api/missing`)).status, 404);
    },
  );
});
test('API streams progress and one final report', async () => {
  await withServer(
    async ({ query, language, onProgress }) => {
      onProgress({ stage: 'searching', message: 'Searching' });
      return { query, language };
    },
    async (base) => {
      const response = await fetch(`${base}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ query: '  FPT  ', language: 'vi' }),
      });
      const events = (await response.text()).trim().split('\n').map(JSON.parse);
      assert.equal(events[0].type, 'progress');
      assert.equal(events[1].type, 'result');
      assert.deepEqual(events[1].report, { query: 'FPT', language: 'vi' });
    },
  );
});
test('API returns actionable quota errors in JSON and streaming modes', async () => {
  await withServer(
    async () => {
      throw { status: 429, message: 'quota exhausted' };
    },
    async (base) => {
      for (const streaming of [false, true]) {
        const response = await fetch(`${base}/api/research`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: streaming ? 'application/x-ndjson' : 'application/json',
          },
          body: JSON.stringify({ query: 'FPT' }),
        });
        const result = await response.json();
        assert.match(result.error, /quota/);
        assert.equal(response.status, streaming ? 200 : 429);
      }
    },
  );
});

test('news and history endpoints work without a Gemini report; research defaults to Vietnamese', async () => {
  const calls = [];
  const app = createApp({
    research: async ({ language }) => ({ language }),
    news: async (input) => {
      calls.push(input);
      return { articles: [], provider: 'Tavily' };
    },
    prices: async (input) => {
      calls.push(input);
      return { points: [], provider: 'Vietstock' };
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await (await post('/api/news', { query: 'FPT' })).json()).provider, 'Tavily');
    assert.equal(calls[0].language, 'vi');
    assert.equal(calls[0].days, 30);
    assert.equal((await post('/api/news', { query: 'X' })).status, 400);
    assert.equal(
      (await (await fetch(base + '/api/prices?ticker=FPT&exchange=HOSE')).json()).provider,
      'Vietstock',
    );
    assert.equal(calls[1].ticker, 'FPT');
    await post('/api/news', { query: 'FPT', days: 730 });
    assert.equal(calls[2].days, 730);
    assert.deepEqual(await (await post('/api/research', { query: 'FPT' })).json(), {
      language: 'vi',
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('disconnecting a streaming request cancels provider work', async () => {
  let markAborted;
  const aborted = new Promise((resolve) => {
    markAborted = resolve;
  });
  await withServer(
    async ({ signal }) => {
      await new Promise((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            markAborted();
            resolve();
          },
          { once: true },
        ),
      );
      return {};
    },
    async (base) => {
      const controller = new AbortController();
      const response = await fetch(`${base}/api/research`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ query: 'FPT' }),
      });
      assert.equal(response.status, 200);
      controller.abort();
      let timeout;
      try {
        await Promise.race([
          aborted,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Provider did not receive cancellation')),
              2000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    },
  );
});
