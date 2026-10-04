// Conservative code checks on supplied evidence, not an independent publisher audit.
import { companyAliases } from '../shared/companyAliases.js';

function companyText(text, ticker) {
  if (!ticker) return text;
  const mentions = (sentence, code) =>
    [code, ...(companyAliases[code] || [])].some((name) =>
      new RegExp(`\\b${normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
        normalize(sentence),
      ),
    );
  return text
    .split(/(?<=[.!?;])\s+|\n/)
    .filter(
      (sentence) =>
        mentions(sentence, ticker) ||
        !Object.keys(companyAliases).some((code) => code !== ticker && mentions(sentence, code)),
    )
    .join('\n');
}
function containsNumber(text, value) {
  if (!Number.isFinite(value)) return false;
  return (text.match(/\d+(?:[.,]\d+)*/g) || []).some((token) => {
    const values = [
      Number(token),
      Number(token.replace(/\./g, '').replace(',', '.')),
      Number(token.replace(/,/g, '')),
    ];
    return values.some((number) => Number.isFinite(number) && Math.abs(number - value) < 0.000001);
  });
}

const cumulative =
  /year.to.date|\bYTD\b|first.half|half.year|six.month|nine.month|nửa đầu|bán niên|lũy kế|luỹ kế|[69]\s*tháng đầu/i;
const forecast = /forecast|estimate|projected|ước tính|dự báo|dự kiến/i;

function contextFor(result, claim) {
  const position = result.text?.indexOf(claim.text) ?? -1;
  if (position < 0) return claim.text;
  const before = result.text.slice(0, position);
  const paragraph = before.slice(before.lastIndexOf('\n\n') + 2);
  return paragraph + claim.text;
}

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
}

function supportsPeriod(context, row) {
  const text = normalize(context);
  if (!text.includes(row.period.slice(0, 4)) || /trailing|\bttm\b|12 thang qua/.test(text))
    return false;
  if (row.kind === 'ytd') {
    const month = Number(row.period.slice(5, 7));
    if (
      /first.half|half.year|six.month|nửa đầu|bán niên|6\s*tháng đầu/i.test(context) &&
      month !== 6
    )
      return false;
    if (/nine.month|9\s*tháng đầu/i.test(context) && month !== 9) return false;
    return cumulative.test(context);
  }
  if (row.kind === 'annual')
    return (
      /annual|full.year|ca nam|nam\s+20\d\d/.test(text) && !/quy|quarter|\bq[1-4]\b/.test(text)
    );
  const quarter = Math.ceil(Number(row.period.slice(5, 7)) / 3);
  return new RegExp(`quy\\s*${quarter}|quarter\\s*${quarter}|q${quarter}\\b`).test(text);
}

const metricNames = {
  revenue: /revenue|sales|doanh thu/i,
  netIncome: /net (income|profit)|profit after tax|loi nhuan (sau thue|rong)|lnst/i,
  operatingCashFlow:
    /operating cash flow|cash flow from operat|dong tien.*(hoat dong kinh doanh|hd kinh doanh)/i,
  netMargin: /net.*margin|bien loi nhuan/i,
  debtEquity: /debt.*equity|no.*von chu so huu/i,
};

function supportsMetric(text, field, value) {
  const normalized = normalize(text);
  const label = new RegExp(metricNames[field].source, 'gi');
  for (const match of normalized.matchAll(label)) {
    let after = normalized.slice(
      match.index + match[0].length,
      match.index + match[0].length + 100,
    );
    const other = Object.entries(metricNames)
      .filter(([key]) => key !== field)
      .map(([, pattern]) => pattern.source)
      .join('|');
    after = after.split(new RegExp(other, 'i'))[0];
    const first = after.match(/-?\d+(?:[.,]\d+)*/)?.[0];
    if (first && containsNumber(first, value)) return true;
  }
  return false;
}

export function auditEvidence(report, results, language) {
  const claims = results.flatMap((result) =>
    result.claims.map((claim) => ({ ...claim, context: contextFor(result, claim) })),
  );
  let omitted = 0;
  const fields = ['revenue', 'netIncome', 'operatingCashFlow', 'netMargin', 'debtEquity'];
  report.financials = report.financials.filter((row) => {
    const evidence = claims
      .filter((claim) => claim.sourceIds.some((id) => row.sourceIds.includes(id)))
      .map((claim) => ({ ...claim, text: companyText(claim.text, report.company.ticker) }));
    for (const field of fields) {
      if (row[field] === null) continue;
      // Never allow a half-year total to be relabeled annual or quarterly.
      const matching = evidence.filter((claim) => supportsMetric(claim.text, field, row[field]));
      if (
        !matching.some(
          (claim) =>
            (row.kind === 'ytd' || !cumulative.test(claim.context)) &&
            !forecast.test(claim.context) &&
            supportsPeriod(claim.context, row),
        )
      ) {
        row[field] = null;
        omitted++;
      }
    }
    const usable = fields.some((field) => row[field] !== null);
    if (!usable) omitted++;
    return usable;
  });
  const periods = new Map();
  for (const row of report.financials) {
    const key = `${row.period}:${row.kind}:${row.currency}:${row.unit}:${row.profitBasis}:${row.cashFlowBasis}`;
    if (!periods.has(key)) periods.set(key, []);
    periods.get(key).push(row);
  }
  // Preserve competing source records; never silently average or erase disagreements.
  report.financials = [...periods.values()].flat();
  report.targets = report.targets.filter((row) => {
    if (
      /simply\s*wall|market\s*screener|trading\s*view|investing\.com|consensus|average|median|đồng thuận|các nhà phân tích/i.test(
        row.firm,
      )
    ) {
      omitted++;
      return false;
    }
    const evidence = claims.filter((claim) =>
      claim.sourceIds.some((id) => row.sourceIds.includes(id)),
    );
    if (row.target !== null && !evidence.some((claim) => containsNumber(claim.text, row.target))) {
      row.target = null;
      omitted++;
    }
    if (row.publishedAt) {
      const [year, month, day] = row.publishedAt.slice(0, 10).split('-');
      const dates = [
        row.publishedAt.slice(0, 10),
        `${Number(day)}/${Number(month)}/${year}`,
        `${day}/${month}/${year}`,
        `${Number(day)} thang ${Number(month)} nam ${year}`,
      ];
      if (
        !evidence.some(
          (claim) =>
            !claim.text.startsWith('Brokerage listing:') &&
            dates.some((date) =>
              normalize(
                claim.context.includes('\nPage 1\n')
                  ? claim.context.slice(claim.context.indexOf('\nPage 1\n'))
                  : claim.context,
              ).includes(date),
            ),
        )
      ) {
        row.publishedAt = '';
        omitted++;
      }
    }
    return true;
  });
  report.targets.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const seen = new Set();
  report.targets = report.targets
    .filter((row) => {
      const key = `${row.firm.trim().toLowerCase()}:${row.publishedAt}:${row.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
  function limitSources(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.sourceIds)) value.sourceIds = [...new Set(value.sourceIds)].slice(0, 3);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(limitSources);
      else limitSources(child);
    }
  }
  limitSources(report);
  if (omitted)
    report.limitations.push(
      language === 'vi'
        ? 'Kiểm tra dẫn chứng đã loại số liệu không khớp nguồn, số lũy kế hoặc dự báo bị gán sai kỳ và mục tiêu đồng thuận từ trang tổng hợp. Mục thiếu trường được giữ lại với giá trị chưa xác định.'
        : 'Evidence checks omitted unmatched figures, cumulative or forecast figures mislabeled as period results and aggregator consensus targets. Partial records retain unavailable fields.',
    );
  return report;
}
