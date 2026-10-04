export function freshness(date, snapshot) {
  const days = Math.floor((new Date(snapshot) - new Date(date)) / 86400000);
  if (!date || !Number.isFinite(days)) return 'Date unavailable';
  if (days < 0) return 'Invalid date';
  return days <= 90 ? 'Recent evidence' : days <= 365 ? 'Older evidence' : 'Historical evidence';
}

const scale = (unit) =>
  /billion|tỷ|\bty\b/i.test(unit)
    ? 'billion'
    : /million|triệu|trieu/i.test(unit)
      ? 'million'
      : unit;
export const financialKey = (row) =>
  [
    row.kind,
    row.periodStart || '',
    row.period,
    row.currency,
    scale(row.unit),
    row.profitBasis,
    row.cashFlowBasis,
    ...(!row.unit || !row.currency || row.profitBasis === 'unknown' ? row.sourceIds : []),
  ].join('|');
export const financialMetrics = [
  'revenue',
  'netIncome',
  'operatingCashFlow',
  'netMargin',
  'debtEquity',
];

// Merge compatible complementary cells, never resolve a conflicting value by averaging.
export function prioritizeVietstock(rows, sources = []) {
  const vietstockIds = new Set(
    sources
      .filter((source) => {
        try {
          const host = new URL(source.url).hostname;
          return host === 'vietstock.vn' || host.endsWith('.vietstock.vn');
        } catch {
          return false;
        }
      })
      .map((source) => source.id),
  );
  const groups = new Map();
  for (const row of rows)
    if (row.conflictGroup) {
      if (!groups.has(row.conflictGroup)) groups.set(row.conflictGroup, []);
      groups.get(row.conflictGroup).push(row);
    }
  const preferred = new Set();
  for (const records of groups.values()) {
    const candidates = records.filter((row) => row.sourceIds.some((id) => vietstockIds.has(id)));
    const row = candidates.find((row) => row.evidenceStatus === 'direct') || candidates[0];
    if (row) preferred.add(row);
  }
  return rows.map((row) => ({
    ...row,
    preferredSource: preferred.has(row) ? 'Vietstock' : '',
    isAlternative: Boolean(
      row.conflictGroup &&
      !preferred.has(row) &&
      groups.get(row.conflictGroup).some((record) => preferred.has(record)),
    ),
  }));
}

export function combineFinancials(rows, sources = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = financialKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const financials = [],
    conflicts = [];
  for (const [key, records] of groups) {
    const fields = financialMetrics.flatMap((metric) => {
      const values = [...new Set(records.map((row) => row[metric]).filter(Number.isFinite))];
      return values.length > 1
        ? [
            {
              metric,
              values: values.map((value) => ({
                value,
                sourceIds: [
                  ...new Set(
                    records.filter((row) => row[metric] === value).flatMap((row) => row.sourceIds),
                  ),
                ],
              })),
            },
          ]
        : [];
    });
    if (fields.length) {
      conflicts.push({
        key,
        period: records[0].period,
        kind: records[0].kind,
        unit: records[0].unit,
        currency: records[0].currency,
        profitBasis: records[0].profitBasis,
        fields,
        note: 'Sources disagree for the same period, unit and accounting scope. Values are shown separately and are not averaged; check original definitions or restatements.',
      });
      financials.push(...records.map((row) => ({ ...row, conflictGroup: key })));
    } else {
      const merged = {
        ...records[0],
        sourceIds: [...new Set(records.flatMap((row) => row.sourceIds))],
      };
      for (const metric of financialMetrics)
        merged[metric] = records.find((row) => Number.isFinite(row[metric]))?.[metric] ?? null;
      merged.evidenceStatus = records.some((row) => row.evidenceStatus === 'sources-only')
        ? 'sources-only'
        : records.some((row) => row.evidenceStatus === 'direct')
          ? 'direct'
          : 'claim-mapped';
      financials.push(merged);
    }
  }
  return {
    financials: prioritizeVietstock(financials, sources).sort((a, b) =>
      a.period.localeCompare(b.period),
    ),
    conflicts,
  };
}
