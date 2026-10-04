import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGrowth } from '../server/companyResearch.js';

const quarter = (period, periodStart, revenue, netIncome) => ({
  kind: 'quarterly',
  period,
  periodStart,
  revenue,
  netIncome,
  unit: 'billion VND',
  currency: 'VND',
  profitBasis: 'consolidated',
  sourceIds: ['D3'],
});

test('four consecutive quarters in the screenshot cannot establish year-on-year growth', () => {
  const rows = [
    quarter('2025-09-30', '2025-07-01', 17204.52, 2901.55),
    quarter('2025-12-31', '2025-10-01', 20225.45, 2988.15),
    quarter('2026-03-31', '2026-01-01', 12480, 2476.79),
    quarter('2026-06-30', '2026-04-01', 13788.5, 2570.41),
  ];
  assert.deepEqual(calculateGrowth(rows), []);
});

test('matching prior-year quarters compute growth and incompatible units are excluded', () => {
  const previous = quarter('2025-06-30', '2025-04-01', 100, 20);
  const current = quarter('2026-06-30', '2026-04-01', 120, 30);
  const growth = calculateGrowth([previous, current]);
  assert.equal(growth.length, 2);
  assert.ok(Math.abs(growth[0].percent - 20) < 1e-10);
  assert.equal(growth[1].percent, 50);
  assert.deepEqual(calculateGrowth([previous, { ...current, unit: 'million VND' }]), []);
});
