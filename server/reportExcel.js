import ExcelJS from 'exceljs';
import { reportRows } from '../shared/reportCsv.js';
import { safeUrl } from '../shared/report.js';
import { enrichListingTargets } from '../shared/brokerListing.js';

// This is the application's runtime exporter; it needs no Gemini call or spreadsheet service.
export async function reportExcel(report, language = 'vi') {
  const book = new ExcelJS.Workbook();
  book.creator = 'FinScope';
  const text = (vi, en) => (language === 'vi' ? vi : en);
  function sheet(name, rows, widths) {
    const page = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    page.addRows(rows.map((row) => row.map((value) => value ?? '')));
    page.columns.forEach((column, i) => {
      column.width = widths[i] || 24;
    });
    page.autoFilter = { from: 'A1', to: { row: 1, column: rows[0].length } };
    page.eachRow((row, number) => {
      let height = 26;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF17384B' } };
        cell.alignment = { vertical: 'top', wrapText: true };
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.##';
        if (typeof cell.value === 'string') {
          const lines = cell.value
            .split('\n')
            .reduce(
              (sum, line) =>
                sum +
                Math.max(1, Math.ceil(line.length / Math.max(10, (widths[col - 1] || 24) - 3))),
              0,
            );
          height = Math.max(height, Math.min(400, lines * 15 + 10));
          if (safeUrl(cell.value)) cell.value = { text: cell.value, hyperlink: cell.value };
        }
        if (number === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153C46' } };
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        } else if (number % 2 === 0)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7F4' } };
      });
      row.height = height;
    });
    return page;
  }
  sheet(
    text('Tổng quan', 'Overview'),
    [
      [text('Thông tin', 'Item'), text('Nội dung', 'Details')],
      [text('Doanh nghiệp', 'Company'), report.company.name],
      [text('Mã cổ phiếu', 'Ticker'), report.company.ticker],
      [text('Đầu vào tìm kiếm', 'Search input'), report.query],
      [text('Ngày nghiên cứu', 'Research date'), report.generatedAt],
      [text('Mô hình nghiên cứu', 'Research model'), report.model],
      [text('Mô hình phân tích bổ sung', 'Intelligence model'), report.companyIntel?.model],
      [text('Trạng thái phân tích', 'Analysis status'), report.analysisStatus?.state],
      [text('Mô hình gặp lỗi', 'Failed model'), report.analysisStatus?.failedModel],
      [text('Chuyển mô hình', 'Model switch'), report.modelNotice],
      [text('Tóm tắt', 'Summary'), report.summary],
      [text('Giới hạn dữ liệu', 'Data limitations'), (report.limitations || []).join('\n')],
      [text('Cảnh báo', 'Warnings'), (report.warnings || []).join('\n')],
      [
        text('Lượt gọi Gemini', 'Gemini attempts'),
        (report.requestUsage?.stages || [])
          .map(
            (row, i) =>
              `${i + 1}. ${row.stage}: ${row.model || report.model} (${row.state || 'received'}${row.status ? ', ' + row.status : ''})`,
          )
          .join('\n'),
      ],
    ],
    [30, 100],
  );
  sheet(
    text('Dữ liệu báo cáo', 'Report data'),
    reportRows(report, language),
    [22, 30, 12, 16, 16, 18, 30, 55, 20, 14, 22, 16, 45, 25, 65],
  );
  const intel = report.companyIntel;
  const targetRows = enrichListingTargets(report).map((row) => {
    const sources = (row.sourceIds || [])
      .map((id) => report.sources.find((source) => source.id === id))
      .filter((source) => source && safeUrl(source.url));
    return [
      text('Báo cáo CTCK', 'Broker report'),
      row.firm,
      row.title,
      row.publishedAt || text('Chưa rõ ngày báo cáo', 'Report date unknown'),
      row.listedAt || '',
      Number.isFinite(row.target) ? row.target : text('Chưa có dữ liệu', 'Not available'),
      row.currency,
      row.rating,
      row.thesis,
      sources.map((source) => source.title || source.id).join('\n'),
      sources.map((source) => source.url).join('\n'),
      row.targetOrigin === 'listing'
        ? text('Giá từ tiêu đề nguồn', 'Target from listing')
        : row.evidenceStatus,
      row.comparable
        ? text('Đã xác nhận', 'Established')
        : text('Chưa xác nhận', 'Not established'),
      row.basis,
    ];
  });
  // Preserve model valuation prose here after removing it from the monitoring sheet.
  const valuationViews = (intel?.watchlist || [])
    .filter((row) => row.valuation_view?.trim())
    .map((row) => [
      text('Nhận định mô hình', 'Model interpretation'),
      '',
      row.ticker,
      '',
      '',
      '',
      '',
      '',
      row.valuation_view,
      (row.evidence_sources || []).map((source) => source.source_name).join('\n'),
      (row.evidence_sources || [])
        .filter((source) => safeUrl(source.source_url))
        .map((source) => source.source_url)
        .join('\n'),
      '',
      '',
      '',
    ]);
  sheet(
    text('Báo cáo định giá', 'Broker valuations'),
    [
      [
        text('Loại thông tin', 'Record type'),
        text('Công ty chứng khoán', 'Broker'),
        text('Tên báo cáo', 'Report title'),
        text('Ngày báo cáo', 'Report date'),
        text('Ngày đăng tại nguồn', 'Publisher listing date'),
        text('Giá mục tiêu', 'Target price'),
        text('Tiền tệ', 'Currency'),
        text('Khuyến nghị', 'Rating'),
        text('Lý do / nhận định', 'Thesis / interpretation'),
        text('Nguồn', 'Sources'),
        'URL',
        text('Xuất xứ giá', 'Target origin'),
        text('Khả năng so sánh', 'Comparability'),
        text('Cơ sở cổ phiếu', 'Share basis'),
      ],
      ...targetRows,
      ...valuationViews,
    ],
    [22, 24, 60, 22, 20, 20, 14, 20, 75, 40, 55, 28, 22, 30],
  );
  if (intel) {
    sheet(
      text('Cập nhật doanh nghiệp', 'Company updates'),
      [
        [
          text('Ngày đăng', 'Published'),
          text('Ngày sự kiện', 'Event date'),
          text('Mã cổ phiếu', 'Tickers'),
          text('Tiêu đề', 'Title'),
          text('Tóm tắt', 'Summary'),
          text('Dữ kiện', 'Facts'),
          text('Nhận định', 'Interpretation'),
          text('Nguồn', 'Publisher'),
          'URL',
        ],
        ...(intel.articles || []).map((row) => [
          row.published_at,
          row.event_date,
          row.tickers?.join(', '),
          row.title,
          row.summary,
          row.facts?.join('\n'),
          row.analysis,
          row.source_name,
          row.source_url,
        ]),
      ],
      [16, 16, 14, 50, 85, 65, 85, 24, 45],
    );
    const refs = (row) =>
      (row.evidence_sources || [])
        .map((source) => `${source.source_name}: ${source.source_url}`)
        .join('\n');
    sheet(
      text('Phân tích và theo dõi', 'Insights and watchlist'),
      [
        [
          text('Loại', 'Type'),
          text('Chủ đề', 'Subject'),
          text('Phân tích', 'Analysis'),
          text('Yếu tố cần theo dõi', 'Factors to monitor'),
          text('Động lực', 'Catalysts'),
          text('Nguồn', 'Sources'),
        ],
        ...(intel.insights || []).map((row) => [
          row.category,
          row.subject,
          row.analysis,
          row.risks?.join('\n'),
          '',
          refs(row),
        ]),
        ...(intel.watchlist || []).map((row) => [
          text('Theo dõi', 'Watchlist'),
          row.ticker,
          row.reason,
          row.risks?.join('\n'),
          row.catalysts?.join('\n'),
          refs(row),
        ]),
        [text('Giới hạn', 'Limitations'), '', (intel.limitations || []).join('\n'), '', '', ''],
      ],
      [20, 45, 85, 70, 60, 55],
    );
  }
  return book.xlsx.writeBuffer();
}
