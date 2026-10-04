import test from 'node:test';
import assert from 'node:assert/strict';
import { priceWindow } from '../src/priceWindow.js';

test('week range uses the latest trading date and keeps actual closing values', () => {
  const points = ['2026-09-24', '2026-09-25', '2026-09-30', '2026-10-01'].map((date, index) => ({
    date,
    close: 100 + index,
  }));
  assert.deepEqual(
    priceWindow(points, '1W').map((point) => point.date),
    ['2026-09-25', '2026-09-30', '2026-10-01'],
  );
  assert.equal(priceWindow(points, '1W').at(-1).close, 103);
});
test('calendar months clamp month end and invalid history never reaches the chart', () => {
  const points = [
    { date: '2026-02-27', close: 100 },
    { date: '2026-02-28', close: 101 },
    { date: '2026-03-31', close: 102 },
    { date: 'invalid', close: 103 },
    { date: '2026-03-15', close: null },
    { date: '2026-03-16', close: 0 },
  ];
  assert.deepEqual(
    priceWindow(points, '1M').map((point) => point.date),
    ['2026-02-28', '2026-03-31'],
  );
  assert.deepEqual(priceWindow([], '1Y'), []);
});
test('wider ranges retain the smaller range without fabricating missing days', () => {
  const points = ['2025-10-03', '2026-04-03', '2026-07-03', '2026-09-03', '2026-10-03'].map(
    (date) => ({ date, close: 100 }),
  );
  assert.equal(priceWindow(points, '1M').length, 2);
  assert.equal(priceWindow(points, '3M').length, 3);
  assert.equal(priceWindow(points, '6M').length, 4);
  assert.equal(priceWindow(points, '1Y').length, 5);
});
