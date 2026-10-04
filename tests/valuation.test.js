import test from 'node:test';
import assert from 'node:assert/strict';
import { valuationView } from '../src/valuation.js';
import { fixture, sources, target } from './fixtures.js';

const report = (targets) => ({ ...fixture(), sources, targets });
test('valuation averages only comparable latest targets, retaining missing and excluded reports', () => {
  const data = valuationView(
    report([
      target(),
      target({ firm: 'B', target: 140 }),
      target({ firm: 'C', target: null }),
      target({ firm: 'D', comparable: false }),
      target({ target: 110, publishedAt: '2026-08-01' }),
    ]),
  );
  assert.equal(data.rows.length, 5);
  assert.equal(data.count, 2);
  assert.equal(data.mean, 130);
  assert.equal(data.median, 130);
  assert.equal(data.spread, 20);
  assert.ok(Math.abs(data.upside - 30) < 0.0001);
});
test('newer missing target supersedes an older target; unavailable statistics stay null', () => {
  const data = valuationView(
    report([target(), target({ target: null, publishedAt: '2026-09-25' })]),
  );
  assert.equal(data.rows.length, 2);
  assert.equal(data.count, 0);
  assert.equal(data.mean, null);
  assert.equal(data.spread, null);
  assert.equal(data.upside, null);
});
test('window, invalid sources, missing reference and currency mismatches are handled', () => {
  const input = report([
    target({ publishedAt: '2026-08-01' }),
    target({ firm: 'B', sourceIds: ['unknown'] }),
    target({ firm: 'C', currency: 'USD' }),
  ]);
  assert.equal(valuationView(input, 30).rows.length, 2);
  assert.equal(valuationView(input, 30).mean, null);
  input.quote.price = null;
  const data = valuationView(input, 365);
  assert.equal(data.mean, 120);
  assert.equal(data.upside, null);
  assert.equal(data.quote, null);
});
test('unmapped and conflicting targets remain visible but do not enter statistics', () => {
  const data = valuationView(
    report([
      target({ evidenceStatus: 'sources-only' }),
      target({ firm: 'B', conflictGroup: 'B:2026-09-20' }),
    ]),
  );
  assert.equal(data.rows.length, 2);
  assert.equal(data.count, 0);
  assert.equal(data.mean, null);
  assert.equal(data.upside, null);
});
