import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEvidence } from '../server/evidenceAudit.js';
import { fixture, target } from './fixtures.js';

test('a revenue field cannot borrow the adjacent net-income figure', () => {
  const report = {
    ...fixture(),
    financials: [
      {
        period: '2025-12-31',
        kind: 'annual',
        currency: 'VND',
        unit: 'billion',
        revenue: 2200,
        netIncome: 2200,
        operatingCashFlow: null,
        netMargin: null,
        debtEquity: null,
        sourceIds: ['F1'],
      },
    ],
  };
  auditEvidence(
    report,
    [
      {
        claims: [
          {
            text: 'Annual 2025 revenue 12000 billion VND and net income 2200 billion VND.',
            sourceIds: ['F1'],
          },
        ],
      },
    ],
    'en',
  );
  assert.equal(report.financials[0].revenue, null);
  assert.equal(report.financials[0].netIncome, 2200);
});

test('cumulative totals cannot survive relabeling, while explicitly reported quarters retain numeric scaling', () => {
  const row = {
    period: '2026-06-30',
    kind: 'quarterly',
    unit: 'tỷ',
    revenue: 13789,
    netIncome: 2570,
    operatingCashFlow: null,
    netMargin: null,
    debtEquity: null,
    sourceIds: ['F1'],
  };
  const report = {
    ...fixture(),
    financials: [row, { ...row, kind: 'annual', revenue: 26269, netIncome: 5047 }],
    targets: [target({ firm: 'Simply Wall St' }), target()],
  };
  auditEvidence(
    report,
    [
      {
        claims: [
          { text: 'Quý 2 năm 2026: doanh thu 13.789 tỷ và lợi nhuận 2.570 tỷ.', sourceIds: ['F1'] },
          { text: 'Nửa đầu năm: doanh thu 26.269 tỷ và lợi nhuận 5.047 tỷ.', sourceIds: ['F1'] },
        ],
      },
    ],
    'vi',
  );
  assert.equal(report.financials.length, 1);
  assert.equal(report.financials[0].revenue, 13789);
  assert.equal(report.targets.length, 1);
  assert.ok(report.limitations.length);
});
test('forecasts and unsupported numbers are omitted instead of filled', () => {
  const report = {
    ...fixture(),
    financials: [
      {
        unit: 'billion',
        revenue: 99,
        netIncome: 10,
        operatingCashFlow: null,
        netMargin: null,
        debtEquity: null,
        sourceIds: ['F1'],
      },
    ],
  };
  auditEvidence(
    report,
    [{ claims: [{ text: 'Forecast revenue 99 billion', sourceIds: ['F1'] }] }],
    'en',
  );
  assert.equal(report.financials.length, 0);
});

test('cash cannot be labeled profit, and publication dates cannot be invented from the search date', () => {
  const report = {
    ...fixture(),
    financials: [
      {
        period: '2026-06-30',
        kind: 'quarterly',
        unit: 'tỷ',
        revenue: null,
        netIncome: 9065.5,
        operatingCashFlow: null,
        netMargin: null,
        debtEquity: null,
        sourceIds: ['F1'],
      },
    ],
    targets: [target({ sourceIds: ['T1'], publishedAt: '2026-10-04' })],
  };
  auditEvidence(
    report,
    [
      {
        claims: [
          { text: 'Quý 2 năm 2026: tiền mặt 9,065.5 tỷ.', sourceIds: ['F1'] },
          { text: 'Firm A target price 120 VND.', sourceIds: ['T1'] },
        ],
      },
    ],
    'en',
  );
  assert.equal(report.financials.length, 0);
  assert.equal(report.targets[0].target, 120);
  assert.equal(report.targets[0].publishedAt, '');
});
