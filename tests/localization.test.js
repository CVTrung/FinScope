import test from 'node:test';
import assert from 'node:assert/strict';
import { translateReport } from '../server/localization.js';
import { fixture } from './fixtures.js';

test('report translation preserves figures, enum values, links, dates, sources and raw evidence', async () => {
  const report = {
    ...fixture(),
    id: 'example',
    language: 'en',
    sources: [{ id: 'F1', title: 'Original filing', url: 'https://source.test' }],
    research: [{ text: 'Original raw evidence' }],
  };
  report.summary = 'Revenue grew 12.5%';
  const original = structuredClone(report);
  const client = {
    models: {
      generateContent: async (input) => {
        const entries = JSON.parse(input.contents.split('\n').at(-1));
        return {
          text: JSON.stringify({
            translations: entries.map(({ id, text }) => ({
              id,
              text: text === 'Revenue grew 12.5%' ? 'Doanh thu tăng 12.5%' : text,
            })),
          }),
        };
      },
    },
  };
  const result = await translateReport({ report, language: 'vi', client });
  assert.equal(result.summary, 'Doanh thu tăng 12.5%');
  assert.deepEqual(result.financials, report.financials);
  assert.deepEqual(result.quote, report.quote);
  assert.deepEqual(result.sources, report.sources);
  assert.deepEqual(result.research, report.research);
  assert.equal(result.language, 'vi');
  assert.deepEqual(report, original);
  const bad = {
    models: {
      generateContent: async (input) => ({
        text: JSON.stringify({
          translations: JSON.parse(input.contents.split('\n').at(-1)).map(({ id, text }) => ({
            id,
            text: text.replace('12.5', '99'),
          })),
        }),
      }),
    },
  };
  await assert.rejects(
    () => translateReport({ report, language: 'vi', client: bad }),
    /preserve the report data/,
  );
});
