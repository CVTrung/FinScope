import test from 'node:test';
import assert from 'node:assert/strict';
import { reportView } from '../src/reportView.js';
import { fixture, sources, target } from './fixtures.js';

test('empty coverage does not invent figures, quotes or observations', () => {
  const report = { ...fixture(), sources: [] };
  const view = reportView(report);
  assert.equal(view.quote, null);
  assert.deepEqual(view.financials, []);
  assert.deepEqual(view.observations, []);
  assert.ok(view.coverage.every((item) => !item.available));
});

test('display keeps sourced partial records and zero values, rejecting invalid sources and future dates', () => {
  const row = {
    kind: 'annual',
    period: '2025-12-31',
    currency: 'VND',
    unit: 'billion VND',
    revenue: 0,
    netIncome: null,
    operatingCashFlow: null,
    netMargin: null,
    debtEquity: null,
    sourceIds: ['F1'],
  };
  const report = {
    ...fixture(),
    sources,
    financials: [
      row,
      { ...row, sourceIds: ['missing'] },
      { ...row, unit: '' },
      { ...row, period: '2027-12-31' },
    ],
    targets: [target(), target({ target: null }), target({ sourceIds: ['missing'] })],
  };
  const view = reportView(report);
  assert.equal(view.financials.length, 2);
  assert.equal(view.financials[0].revenue, 0);
  assert.equal(view.targets.length, 2);
  assert.equal(view.quote.price, 100);
  report.quote.asOf = '';
  assert.equal(reportView(report).quote, null);
});

test('unsupported narrative and empty observations are not displayed as evidence', () => {
  const report = {
    ...fixture(),
    sources,
    analysis: {
      ...fixture().analysis,
      observations: [
        { title: 'Sourced', detail: 'Evidence', sourceIds: ['F1'] },
        { title: 'Unsourced', detail: 'Claim', sourceIds: [] },
        { title: 'Empty', detail: '', sourceIds: ['F1'] },
      ],
    },
  };
  assert.deepEqual(
    reportView(report).observations.map((row) => row.title),
    ['Sourced'],
  );
});
