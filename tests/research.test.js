import test from 'node:test';
import assert from 'node:assert/strict';
import { researchCompany, extractGrounding, publicError } from '../server/research.js';
import { fixture } from './fixtures.js';

const grounded = () => ({
  text: 'Example filing evidence',
  candidates: [
    {
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://example.com/filing', title: 'Filing' } }],
        groundingSupports: [
          { segment: { text: 'Example filing evidence' }, groundingChunkIndices: [0, 99] },
        ],
        webSearchQueries: ['example financials'],
      },
    },
  ],
});
test('grounding preserves claim-source mappings and ignores invalid indices', () => {
  const result = extractGrounding(grounded(), 'F');
  assert.deepEqual(result.claims[0].sourceIds, ['F1']);
  assert.equal(result.sources[0].url, 'https://example.com/filing');
});
test('two Search calls feed a separate structured call with no search tools', async () => {
  const calls = [];
  const client = {
    models: {
      generateContent: async (input) => {
        calls.push(input);
        return input.config.tools ? grounded() : { text: JSON.stringify(fixture()) };
      },
    },
  };
  const report = await researchCompany({
    query: 'Example',
    client,
    now: new Date('2026-10-03T03:00:00Z'),
  });
  assert.equal(calls.length, 3);
  assert.ok(calls.slice(0, 2).every((call) => !call.config.responseMimeType));
  assert.equal(calls[2].config.tools, undefined);
  assert.equal(report.sources.length, 2);
  assert.equal(report.company.name, 'Example Company');
  assert.ok(calls[2].contents.includes('2026-10-03T03:00:00.000Z'));
});
test('partial research remains usable with an explicit coverage limitation', async () => {
  let searchCalls = 0;
  const client = {
    models: {
      generateContent: async (input) => {
        if (!input.config.tools) return { text: JSON.stringify(fixture()) };
        if (++searchCalls === 2) throw new Error('Unavailable');
        return grounded();
      },
    },
  };
  const report = await researchCompany({ query: 'Example', client });
  assert.equal(report.sources.length, 1);
  assert.equal(report.warnings.length, 1);
  assert.ok(
    report.limitations.some((item) => item.includes('Brokerage research research was unavailable')),
  );
});
test('ungrounded results and malformed structured reports fail rather than inventing data', async () => {
  const ungrounded = { models: { generateContent: async () => ({ text: 'No sources' }) } };
  await assert.rejects(
    () => researchCompany({ query: 'Example', client: ungrounded }),
    /no search-grounded evidence/,
  );
  const malformed = {
    models: {
      generateContent: async (input) => (input.config.tools ? grounded() : { text: '{broken' }),
    },
  };
  await assert.rejects(
    () => researchCompany({ query: 'Example', client: malformed }),
    /incomplete report/,
  );
});
test('public provider errors never expose raw API responses', () => {
  assert.equal(publicError({ status: 429, message: 'secret details' }).status, 429);
  assert.equal(publicError({ status: 403, message: 'secret details' }).status, 503);
  assert.ok(!publicError({ message: 'secret details' }).message.includes('secret details'));
});
