import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { retrieveVietstock } from '../server/vietstock.js';
import { calculateGrowth } from '../server/companyResearch.js';
const report = await retrieveVietstock({
  query: 'HPG',
  includePdfs: false,
  signal: AbortSignal.timeout(60000),
});
const quarters = report.financials.filter((row) => row.kind === 'quarterly');
const latest = quarters.at(-1);
const prior = quarters.find(
  (row) => row.period === `${Number(latest.period.slice(0, 4)) - 1}${latest.period.slice(4)}`,
);
assert.equal(quarters.length, 12);
assert.ok(prior && prior.profitBasis === latest.profitBasis && prior.unit === latest.unit);
const growth = calculateGrowth(report.financials).filter(
  (row) => row.period === latest.period && row.kind === 'quarterly',
);
assert.equal(growth.length, 2);
await fs.writeFile(
  'artifacts/vietstock-quarterly-history-verified.json',
  JSON.stringify(
    {
      ticker: report.company.ticker,
      retrievedAt: report.retrievedAt,
      quarters,
      latest,
      prior,
      growth,
      sources: report.sources,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      ticker: report.company.ticker,
      quarters: quarters.length,
      latestPeriod: latest.period,
      priorPeriod: prior.period,
      latestRevenue: latest.revenue,
      priorRevenue: prior.revenue,
      growth,
    },
    null,
    2,
  ),
);
