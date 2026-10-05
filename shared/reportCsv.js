import { enrichListingTargets } from './brokerListing.js';
import { safeUrl } from './report.js';

// One rectangular CSV keeps periods, units, scopes and source links alongside each value.
export function reportRows(report, language = 'vi') {
  const headers =
    language === 'vi'
      ? [
          'Phần',
          'Doanh nghiệp',
          'Mã cổ phiếu',
          'Loại kỳ',
          'Bắt đầu kỳ',
          'Ngày / kết thúc kỳ',
          'Chỉ tiêu / CTCK',
          'Giá trị',
          'Đơn vị',
          'Tiền tệ',
          'Phạm vi kế toán',
          'Mã nguồn',
          'URL nguồn',
          'Trạng thái dẫn chứng',
          'Ghi chú',
        ]
      : [
          'Section',
          'Company',
          'Ticker',
          'Period type',
          'Period start',
          'Date / period end',
          'Metric / broker',
          'Value',
          'Unit',
          'Currency',
          'Accounting scope',
          'Source IDs',
          'Source URLs',
          'Evidence status',
          'Notes',
        ];
  const rows = [headers];
  const sources = [...(report.sources || []), ...(report.priceData?.sources || [])];
  const label = (vi, en) => (language === 'vi' ? vi : en);
  function add(section, metric, value, row = {}, extra = {}) {
    const refs = row.sourceIds || [];
    const urls = refs.map((id) => sources.find((source) => source.id === id)?.url).filter(safeUrl);
    rows.push([
      section,
      report.company.name,
      report.company.ticker,
      row.kind || '',
      row.periodStart || '',
      row.period || row.publishedAt || row.asOf || row.date || '',
      metric,
      value ?? '',
      extra.unit ?? row.unit ?? '',
      row.currency || '',
      extra.scope ?? row.profitBasis ?? '',
      refs.join('; '),
      [...new Set(urls)].join('; '),
      row.evidenceStatus || '',
      extra.notes || '',
    ]);
  }
  add(
    label('Doanh nghiệp', 'Company'),
    label('Mô tả', 'Description'),
    report.company.description,
    report.company,
  );
  for (const [key, vi, en] of [
    ['price', 'Giá cổ phiếu', 'Stock price'],
    ['changePercent', 'Biến động giá', 'Price change'],
  ])
    if (Number.isFinite(report.quote[key]))
      add(label('Giá cổ phiếu', 'Stock quote'), label(vi, en), report.quote[key], report.quote, {
        unit: key === 'changePercent' ? '%' : report.quote.currency,
      });
  const metrics = [
    ['revenue', 'Doanh thu', 'Revenue'],
    ['netIncome', 'Lợi nhuận sau thuế', 'Net income'],
    ['operatingCashFlow', 'Dòng tiền kinh doanh', 'Operating cash flow'],
    ['netMargin', 'Biên lợi nhuận ròng', 'Net margin'],
    ['debtEquity', 'Nợ / vốn chủ sở hữu', 'Debt / equity'],
  ];
  for (const row of report.financials)
    for (const [key, vi, en] of metrics)
      if (Number.isFinite(row[key]))
        add(label('Tài chính', 'Financials'), label(vi, en), row[key], row, {
          unit: key === 'netMargin' ? '%' : key === 'debtEquity' ? 'x' : row.unit,
          scope: key === 'operatingCashFlow' ? row.cashFlowBasis : row.profitBasis,
          notes: [
            row.preferredSource && label('Ưu tiên ', 'Preferred: ') + row.preferredSource,
            row.conflictGroup && label('Số liệu chưa thống nhất', 'Conflicting figures'),
          ]
            .filter(Boolean)
            .join('; '),
        });
  for (const row of enrichListingTargets(report))
    add(label('Định giá', 'Valuation'), row.firm, row.target, row, {
      unit: row.currency,
      notes: [
        row.title,
        row.listedAt && label('Ngày đăng tại nguồn: ', 'Listing date: ') + row.listedAt,
        row.targetOrigin === 'listing' && label('Giá từ tiêu đề nguồn', 'Target from listing'),
        ...['thesis', 'assumptions', 'risks'].map((key) => row[key]),
      ]
        .filter(Boolean)
        .join('\n'),
    });
  for (const row of report.growth || [])
    add(label('Tăng trưởng cùng kỳ', 'Year-on-year growth'), row.metric, row.percent, row, {
      unit: '%',
      notes: label('So với ', 'Compared with ') + row.previousPeriod,
    });
  for (const row of report.metrics || [])
    add(label('Chỉ tiêu', 'Metrics'), row.label, row.value, row);
  for (const row of report.analysis.observations || [])
    add(label('Nhận định', 'Observations'), row.title, row.detail, row);
  for (const row of report.priceData?.points || [])
    add(label('Lịch sử giá', 'Price history'), label('Giá đóng cửa', 'Closing price'), row.close, {
      ...row,
      currency: report.priceData.currency,
      sourceIds: (report.priceData.sources || []).map((source) => source.id),
    });
  for (const source of sources)
    if (safeUrl(source.url))
      add(
        label('Nguồn', 'Sources'),
        source.id,
        source.url,
        { sourceIds: [source.id] },
        { notes: source.title },
      );
  return rows;
}

export function reportCsv(report, language = 'vi') {
  const rows = reportRows(report, language);
  function cell(value) {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
