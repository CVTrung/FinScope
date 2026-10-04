import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanReport,
  summarizeTargets,
  validDate,
  safeUrl,
  cashConversion,
} from '../shared/report.js';
import { fixture, sources, target } from './fixtures.js';

test('unknown and mismatched targets never enter the median', () => {
  const report = fixture();
  report.targets = [
    target(),
    target({ firm: 'B', target: 140 }),
    target({ firm: 'C', target: null }),
    target({ firm: 'D', currency: 'USD' }),
    target({ firm: 'E', publishedAt: '2025-01-01' }),
    target({ firm: 'F', publishedAt: '2027-01-01' }),
    target({ firm: 'G', sourceIds: [] }),
    target({ firm: 'H', basis: 'per share' }),
  ];
  const result = summarizeTargets(report);
  assert.equal(result.count, 2);
  assert.equal(result.median, 130);
  assert.equal(result.low, 120);
  assert.equal(result.high, 140);
  assert.ok(Math.abs(result.rows[0].difference - 20) < 0.0001);
});
test('a newer report without a target supersedes the old report from the same firm', () => {
  const report = fixture();
  report.targets = [
    target(),
    target({ firm: ' FIRM A ', target: null, publishedAt: '2026-10-01' }),
  ];
  assert.equal(summarizeTargets(report).count, 0);
});
test('missing market price preserves eligible targets but disables percentage comparison', () => {
  const report = fixture();
  report.quote.price = null;
  report.targets = [target()];
  const result = summarizeTargets(report);
  assert.equal(result.median, 120);
  assert.equal(result.rows[0].difference, null);
});
test('no eligible targets yields null rather than a zero target', () => {
  const result = summarizeTargets(fixture());
  assert.equal(result.median, null);
  assert.equal(result.low, null);
});
test('source IDs cannot invent links; unsourced financials and quotes are suppressed', () => {
  const report = fixture();
  report.quote.sourceIds = ['FAKE'];
  report.metrics[0].sourceIds = ['FAKE'];
  report.financials = [
    {
      period: '2025-12-31',
      kind: 'annual',
      currency: 'VND',
      unit: 'billion',
      revenue: 100,
      netIncome: 5,
      operatingCashFlow: 6,
      netMargin: 5,
      debtEquity: 0.2,
      sourceIds: ['FAKE'],
    },
  ];
  const result = cleanReport(report, sources, report.generatedAt);
  assert.equal(result.quote.price, null);
  assert.equal(result.metrics.length, 0);
  assert.equal(result.financials[0].revenue, null);
});
test('future, negative, incompatible and duplicate price observations are removed', () => {
  const report = fixture();
  const point = {
    date: '2026-09-30',
    close: 100,
    currency: 'VND',
    basis: report.quote.basis,
    sourceIds: ['F1'],
  };
  report.priceHistory = [
    point,
    { ...point },
    { ...point, date: '2027-01-01' },
    { ...point, date: '2026-09-29', close: -10 },
    { ...point, date: '2026-09-28', currency: 'USD' },
  ];
  const result = cleanReport(report, sources, report.generatedAt);
  assert.equal(result.priceHistory.length, 1);
});
test('inconsistent reported net margin is retained with a reconciliation explanation', () => {
  const report = fixture();
  report.financials = [
    {
      period: '2025-12-31',
      kind: 'annual',
      currency: 'VND',
      unit: 'million',
      revenue: 100,
      netIncome: 10,
      operatingCashFlow: 15,
      netMargin: 20,
      debtEquity: null,
      sourceIds: ['F1'],
    },
  ];
  const result = cleanReport(report, sources, report.generatedAt);
  assert.equal(result.financials[0].netMargin, 20);
  assert.ok(result.limitations.some((item) => item.includes('does not reconcile')));
});
test('cash conversion requires comparable accounting scope and orders periods chronologically', () => {
  const row = {
    kind: 'annual',
    netIncome: 10,
    operatingCashFlow: 15,
    sourceIds: ['F1'],
    profitBasis: 'consolidated',
    cashFlowBasis: 'consolidated',
  };
  const result = cashConversion(
    [
      { ...row, period: '2025-12-31' },
      { ...row, period: '2024-12-31' },
      { ...row, period: '2023-12-31', profitBasis: 'attributable' },
      { ...row, period: '2022-12-31', netIncome: 0 },
    ],
    'annual',
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].period, '2024-12-31');
  assert.equal(result[0].ratio, 1.5);
});
test('strict dates and web-only source URLs', () => {
  assert.equal(validDate('2026-02-30'), null);
  assert.equal(validDate('yesterday'), null);
  assert.ok(validDate('2026-10-01'));
  assert.ok(validDate('2026-10-01T01:00:00+07:00'));
  assert.equal(validDate('2026-10-01T25:00:00Z'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://example.com'), 'https://example.com/');
});
