import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptReport } from '../server/reportAcceptance.js';
import { combineFinancials, prioritizeVietstock } from '../shared/evidence.js';
import { cleanReport, summarizeTargets } from '../shared/report.js';
import { calculateGrowth } from '../server/companyResearch.js';
import { coverageFixture } from './coverageFixture.js';
import { requestError } from '../src/requestError.js';
import { reportView } from '../src/reportView.js';

test('secondary evidence, old records, YTD and partial broker reports remain traceable', () => {
  const { data, snapshot } = coverageFixture();
  const report = acceptReport(data, snapshot);
  assert.equal(report.financials.length, 5);
  assert.equal(
    report.financials.find((row) => row.period === '2022-12-31').freshness,
    'Historical evidence',
  );
  assert.equal(report.financials.find((row) => row.kind === 'ytd').revenue, 6400);
  assert.equal(report.financials.find((row) => row.kind === 'quarterly').revenue, 3400);
  assert.equal(report.targets.length, 2);
  assert.equal(report.targets.find((row) => row.firm === 'SSI').target, null);
  assert.equal(report.targets.find((row) => row.firm === 'KBSV').target, 86000);
  assert.equal(report.targets[0].comparable, false);
  assert.equal(summarizeTargets(report).median, null);
  assert.equal(report.conflicts.length, 1);
  assert.deepEqual(
    report.conflicts[0].fields[0].values.map((row) => row.value),
    [12000, 12500],
  );
  assert.deepEqual(calculateGrowth(report.financials), []);
  const view = reportView({
    ...report,
    sources: snapshot.results.flatMap((section) => section.sources),
    generatedAt: snapshot.generatedAt,
  });
  assert.equal(view.financials.filter((row) => row.period === '2025-12-31').length, 1);
  assert.equal(view.financials.find((row) => row.period === '2025-12-31').revenue, 12000);
  assert.equal(
    view.financials.find((row) => row.period === '2025-12-31').preferredSource,
    'Vietstock',
  );
});
test('URLs without sentence mappings retain sources-only sections and never assert verified figures', () => {
  const { data, snapshot } = coverageFixture(true);
  const report = acceptReport(data, snapshot);
  assert.equal(report.financials.length, 5);
  assert.ok(report.financials.every((row) => row.evidenceStatus === 'sources-only'));
  assert.ok(report.targets.every((row) => row.evidenceStatus === 'sources-only'));
  assert.ok(report.limitations.includes('Sources provided; individual claims not verified'));
  const cleaned = cleanReport(
    report,
    snapshot.results.flatMap((row) => row.sources),
    snapshot.generatedAt,
  );
  assert.equal(cleaned.financials[0].evidenceStatus, 'sources-only');
  assert.equal(
    cleaned.financials.find((row) => row.conflictGroup).conflictGroup,
    report.conflicts[0].key,
  );
});
test('invented numbers, foreign-company records, invalid sources and future dates remain rejected', () => {
  const { data, snapshot } = coverageFixture();
  data.financials[0].revenue = 999999;
  snapshot.results[1].text = 'VCB annual 2025 revenue 12500 billion VND consolidated.';
  snapshot.results[1].claims[0].text = snapshot.results[1].text;
  data.financials.push({ ...data.financials[2], sourceIds: ['invalid'] });
  data.financials.push({ ...data.financials[2], period: '2027-06-30' });
  data.targets.push({ ...data.targets[0], publishedAt: '2026-02-30' });
  const report = acceptReport(data, snapshot);
  assert.equal(report.financials.length, 3);
  assert.ok(report.financials.every((row) => row.revenue !== 999999 && row.revenue !== 12500));
  assert.equal(report.targets.length, 2);
  data.company.ticker = 'VCB';
  assert.throws(() => acceptReport(data, snapshot), /Company identity conflicts/);
});
test('unknown units stay empty and different units or accounting scopes do not merge', () => {
  const { data, snapshot } = coverageFixture();
  data.financials[0].unit = '';
  data.financials[0].currency = '';
  const report = acceptReport(data, snapshot);
  assert.equal(report.financials.find((row) => row.revenue === 12000).unit, '');
  const row = data.financials[1];
  const combined = combineFinancials([
    row,
    { ...row, unit: 'million VND' },
    { ...row, profitBasis: 'standalone' },
  ]);
  assert.equal(combined.financials.length, 3);
  assert.equal(combined.conflicts.length, 0);
});
test('fetch failures identify the unavailable backend while provider errors retain their message', () => {
  assert.match(requestError(new TypeError('Failed to fetch')), /backend cannot be reached/);
  assert.equal(requestError(new Error('Gemini quota exceeded')), 'Gemini quota exceeded');
});
test('publisher preference uses the actual Vietstock hostname and favors directly retrieved rows', () => {
  const rows = ['fake', 'secondary', 'direct'].map((id) => ({
    sourceIds: [id],
    conflictGroup: 'same',
    evidenceStatus: id === 'direct' ? 'direct' : 'claim-mapped',
  }));
  const ranked = prioritizeVietstock(rows, [
    { id: 'fake', url: 'https://vietstock.vn.evil.test/fpt' },
    { id: 'secondary', url: 'https://vietstock.vn/fpt' },
    { id: 'direct', url: 'https://finance.vietstock.vn/fpt' },
  ]);
  assert.equal(ranked[2].preferredSource, 'Vietstock');
  assert.equal(ranked[0].isAlternative, true);
  assert.equal(ranked[1].isAlternative, true);
  assert.ok(ranked.every((row) => row.conflictGroup === 'same'));
});
