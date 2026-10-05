import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { reportExcel } from '../server/reportExcel.js';
import { fixture, vietstockFixture, target, sources } from './fixtures.js';
import { intelFixture } from './companyIntelFixture.js';
import { createApp } from '../server/app.js';

test('Excel keeps numeric zero, loss, missing targets, sources, Unicode and intelligence', async () => {
  const report = fixture();
  report.sources = sources;
  report.company.description = '=SUM(1,2)';
  report.financials = vietstockFixture().financials;
  report.targets = [target()];
  report.financials[0].revenue = 0;
  report.financials[0].netIncome = -10;
  report.targets[0].target = null;
  report.companyIntel = { ...intelFixture(), model: 'gemini-3.5-flash-lite' };
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await reportExcel(report));
  assert.deepEqual(
    book.worksheets.map((sheet) => sheet.name),
    [
      'Tổng quan',
      'Dữ liệu báo cáo',
      'Báo cáo định giá',
      'Cập nhật doanh nghiệp',
      'Phân tích và theo dõi',
    ],
  );
  const monitoring = book.getWorksheet('Phân tích và theo dõi');
  assert.equal(monitoring.columnCount, 6);
  assert.equal(monitoring.getCell('F1').value, 'Nguồn');
  assert.equal(monitoring.getRow(1).values.includes('Định giá'), false);
  const brokers = book.getWorksheet('Báo cáo định giá');
  assert.equal(brokers.columnCount, 14);
  assert.equal(brokers.getCell('J1').value, 'Nguồn');
  assert.equal(brokers.getCell('K1').value, 'URL');
  assert.equal(brokers.getCell('B2').value, report.targets[0].firm);
  assert.equal(brokers.getCell('F2').value, 'Chưa có dữ liệu');
  assert.equal(brokers.getCell('D2').value, report.targets[0].publishedAt);
  assert.ok(brokers.rowCount >= 2);
  const sheet = book.getWorksheet('Dữ liệu báo cáo');
  const rows = [];
  sheet.eachRow((row) => rows.push(row.values.slice(1)));
  assert.equal(rows.find((row) => row[6] === 'Doanh thu')[7], 0);
  assert.equal(rows.find((row) => row[6] === 'Lợi nhuận sau thuế')[7], -10);
  assert.ok(!rows.find((row) => row[0] === 'Định giá')[7]);
  assert.equal(rows[1][7], '=SUM(1,2)');
  assert.equal(sheet.getRow(2).getCell(8).type, ExcelJS.ValueType.String);
  assert.equal(sheet.getRow(1).getCell(1).alignment.wrapText, true);
  assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(
    book.getWorksheet('Cập nhật doanh nghiệp').getCell('D2').value,
    report.companyIntel.articles[0].title,
  );
  assert.equal(
    book.getWorksheet('Phân tích và theo dõi').getCell('C2').value,
    report.companyIntel.insights[0].analysis,
  );
});

test('Excel download endpoint accepts saved reports and selected language; rejects invalid input', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/export-report`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: fixture(), language: 'en' }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /spreadsheetml/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
    assert.equal(book.worksheets[0].name, 'Overview');
    const invalid = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('broker Excel tab keeps listing prices numeric without inventing report dates or comparability', async () => {
  const report = fixture();
  report.company.ticker = 'MWG';
  report.sources = [
    {
      id: 'B1',
      title: 'MWG: Khuyến nghị MUA với giá mục tiêu 125,700 đồng/cổ phiếu',
      url: 'https://finance.vietstock.vn/MWG/report',
    },
  ];
  report.targets = [
    target({
      firm: 'VNDS',
      title: report.sources[0].title,
      target: null,
      publishedAt: '',
      listedAt: '2026-09-25',
      sourceIds: ['B1'],
    }),
  ];
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await reportExcel(report, 'en'));
  const sheet = book.getWorksheet('Broker valuations');
  assert.equal(sheet.getCell('D2').value, 'Report date unknown');
  assert.equal(sheet.getCell('E2').value, '2026-09-25');
  assert.equal(sheet.getCell('F2').value, 125700);
  assert.equal(sheet.getCell('G2').value, 'VND');
  assert.equal(sheet.getCell('L2').value, 'Target from listing');
  assert.equal(sheet.getCell('M2').value, 'Not established');
  assert.equal(sheet.getCell('K2').hyperlink, report.sources[0].url);
});
