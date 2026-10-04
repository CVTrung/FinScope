import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCsv } from '../shared/reportCsv.js';
import { fixture, sources, target } from './fixtures.js';

// Parse quoted CSV, including embedded commas, quotes and newlines.
function parseCsv(csv) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && char === '\r' && csv[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += char;
  }
  return rows;
}

test('CSV preserves Vietnamese, multiline text, zero and partial targets in rectangular rows', () => {
  const report = fixture();
  report.sources = sources;
  report.company.description = 'Doanh nghiệp, "Việt Nam"\nDòng thứ hai';
  report.targets = [target({ target: null })];
  report.financials = [
    {
      kind: 'quarterly',
      period: '2026-06-30',
      periodStart: '2026-04-01',
      revenue: 0,
      netIncome: -10,
      unit: 'billion VND',
      currency: 'VND',
      profitBasis: 'consolidated',
      sourceIds: ['F1'],
    },
  ];
  const csv = reportCsv(report);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const rows = parseCsv(csv);
  assert.ok(rows.every((row) => row.length === 15));
  assert.equal(rows[1][7], report.company.description);
  const revenue = rows.find((row) => row[6] === 'Doanh thu');
  assert.equal(revenue[7], '0');
  assert.equal(revenue[8], 'billion VND');
  assert.equal(revenue[10], 'consolidated');
  assert.equal(revenue[12], sources[0].url);
  assert.equal(rows.find((row) => row[6] === 'Lợi nhuận sau thuế')[7], '-10');
  assert.equal(rows.find((row) => row[0] === 'Định giá')[7], '');
});

test('CSV resolves chart sources and neutralizes formula text while using English labels', () => {
  const report = fixture();
  report.sources = sources;
  report.company.description = '=SUM(1,2)';
  report.priceData = {
    currency: 'VND',
    points: [{ date: '2026-10-01', close: 123 }],
    sources: [{ id: 'P1', title: 'Price', url: 'https://finance.vietstock.vn/FPT.htm' }],
  };
  const rows = parseCsv(reportCsv(report, 'en'));
  assert.equal(rows[0][0], 'Section');
  assert.equal(rows[1][7], "'=SUM(1,2)");
  assert.equal(rows.find((row) => row[0] === 'Price history')[12], report.priceData.sources[0].url);
});
