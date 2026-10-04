import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVietstockFinancials,
  parseVietstockRatios,
  parseVietstockReports,
} from '../server/vietstock.js';
import { chartStats } from '../shared/prices.js';
const now = new Date('2026-10-04');
const financialData = (column) => [
  [{ ID: 1, PeriodBegin: '202601', PeriodEnd: '202603', United: 'HN', ...column }],
  {
    income: [
      { NameEn: 'Net revenue', Value1: 12000000000000 },
      { NameEn: 'Profit after tax', Value1: 2000000000000 },
      { NameEn: 'Net profit', Value1: 1800000000000 },
    ],
  },
];

test('direct financial parsing keeps cumulative periods explicitly separate as year to date', () => {
  const rows = parseVietstockFinancials(financialData(), 'quarterly', 'D3', now);
  assert.equal(rows[0].revenue, 12000);
  assert.equal(rows[0].netIncome, 2000);
  assert.equal(rows[0].originalNetIncome, 2000000000000);
  assert.equal(rows[0].profitBasis, 'consolidated');
  assert.equal(rows[0].operatingCashFlow, null);
  assert.equal(rows[0].period, '2026-03-31');
  const [ytd] = parseVietstockFinancials(
    financialData({ PeriodEnd: '202606' }),
    'quarterly',
    'D3',
    now,
  );
  assert.equal(ytd.kind, 'ytd');
  assert.equal(ytd.periodStart, '2026-01-01');
  assert.equal(ytd.period, '2026-06-30');
  assert.equal(ytd.revenue, 12000);
  assert.deepEqual(
    parseVietstockFinancials(financialData({ PeriodEnd: '202613' }), 'annual', 'D2', now),
    [],
  );
});

test('unrecognized banking revenue is not relabeled and invalid ratio periods stay unavailable', () => {
  const banking = financialData();
  banking[1].income = [{ NameEn: 'Net interest income', Value1: 1e12 }];
  assert.deepEqual(parseVietstockFinancials(banking, 'quarterly', 'D3', now), []);
  const ratios = [[{ ID: 1, PeriodEnd: '202613' }], { ratio: [{ NameEn: 'P/E', Value1: 10 }] }];
  assert.deepEqual(parseVietstockRatios(ratios, 'D3', now), []);
});

test('broker listing dates remain listing metadata without becoming verified original dates or targets', () => {
  const data = [
    {
      StockCode: 'FPT',
      SourceName: 'KBSV',
      Title: 'FPT target 86000',
      Url: '/bao-cao-phan-tich/123/fpt.htm',
      PublishDate: '/Date(1789948800000)/',
      ReportID: 123,
    },
  ];
  const [row] = parseVietstockReports(data, 'FPT', now);
  assert.ok(row.listedAt);
  assert.equal(row.publishedAt, undefined);
  assert.equal(row.target, undefined);
  assert.equal(parseVietstockReports(data, 'VCB', now).length, 0);
});

test('Node chart statistics use actual prices and selected trading periods', () => {
  const stats = chartStats([
    { date: '2026-09-01', close: 50 },
    { date: '2026-10-01', close: 100 },
    { date: '2026-10-02', close: 110 },
  ]);
  assert.ok(Math.abs(stats['1W'].changePercent - 10) < 0.00001);
  assert.equal(stats['1W'].count, 2);
  assert.equal(stats['1W'].low, 100);
  assert.equal(chartStats([])['1Y'].changePercent, null);
});
