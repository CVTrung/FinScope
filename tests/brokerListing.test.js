import test from 'node:test';
import assert from 'node:assert/strict';
import { listingTarget, enrichListingTargets, targetReasoning } from '../shared/brokerListing.js';
import { valuationView } from '../src/valuation.js';
import { fixture, target } from './fixtures.js';

test('listing targets accept explicit Vietnamese prices and both thousands separators', () => {
  assert.deepEqual(
    listingTarget('HPG: Khuyến nghị MUA với giá mục tiêu 32,150 đồng/cổ phiếu', 'HPG'),
    { target: 32150, currency: 'VND' },
  );
  assert.deepEqual(listingTarget('HPG: giá mục tiêu 26.900 VND', 'HPG'), {
    target: 26900,
    currency: 'VND',
  });
  assert.equal(listingTarget('HPG: doanh thu 32,150 tỷ đồng', 'HPG'), null);
  assert.equal(listingTarget('FPT: giá mục tiêu 32,150 đồng', 'HPG'), null);
  assert.equal(listingTarget('HPG: giá mục tiêu không công bố', 'HPG'), null);
});
test('saved publisher listings recover targets but keep date unknown and exclude calculations', () => {
  const report = fixture();
  report.company.ticker = 'HPG';
  report.sources = [
    {
      id: 'B1',
      title: 'KBSV · HPG: giá mục tiêu 32,150 đồng/cổ phiếu · Vietstock listing',
      url: 'https://finance.vietstock.vn/bao-cao-phan-tich/hpg.htm',
    },
  ];
  report.targets = [target({ target: null, publishedAt: '', comparable: true, sourceIds: ['B1'] })];
  const [row] = enrichListingTargets(report);
  assert.equal(row.target, 32150);
  assert.equal(row.currency, 'VND');
  assert.equal(row.publishedAt, '');
  assert.equal(row.targetOrigin, 'listing');
  assert.equal(row.comparable, false);
  assert.equal(valuationView(report).mean, null);
  report.sources[0].url = 'https://vietstock.vn.evil.test/report';
  assert.equal(enrichListingTargets(report)[0].target, null);
});
test('reasoning contains only populated content rather than unavailable placeholders', () => {
  assert.deepEqual(targetReasoning({ thesis: 'Demand recovered', assumptions: '', risks: 'N/A' }), [
    ['Thesis', 'Demand recovered'],
  ]);
  assert.deepEqual(targetReasoning({}), []);
});
