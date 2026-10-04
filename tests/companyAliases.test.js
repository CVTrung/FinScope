import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesNewsQuery,
  buildNewsSearchQuery,
  resolveNewsCompany,
} from '../shared/companyAliases.js';

test('company-only input accepts supported tickers and full names but rejects broad topics and extra instructions', () => {
  for (const query of ['HPG', 'Hoa Phat', 'Công ty cổ phần Hòa Phát', 'FPT (HOSE)', 'Vinamilk'])
    assert.ok(resolveNewsCompany(query), query);
  for (const query of [
    'economy',
    'inflation',
    'chứng khoán',
    'stock market',
    'FPT inflation',
    'HPG FPT',
    'XYZ',
  ])
    assert.equal(resolveNewsCompany(query), null, query);
});

test('GAS news requires the company name or explicit stock context, excluding stoves and generic gas prices', () => {
  for (const title of ['Bếp gas mini phát nổ', 'Giá gas hôm nay tăng mạnh', 'Gas prices climb'])
    assert.equal(matchesNewsQuery({ title }, 'GAS'), false, title);
  for (const title of [
    'PV GAS công bố kết quả',
    'GAS: Nghị quyết HĐQT',
    'Cổ phiếu GAS tăng giá',
    'PetroVietnam Gas reports results',
  ])
    assert.equal(matchesNewsQuery({ title }, 'GAS'), true, title);
  assert.equal(buildNewsSearchQuery('GAS'), '("PV GAS" OR "PetroVietnam Gas" OR "cổ phiếu GAS")');
});

test('outbound queries expand tickers and accentless names to company aliases', () => {
  assert.equal(buildNewsSearchQuery('HPG'), '(HPG OR "Hòa Phát")');
  assert.equal(buildNewsSearchQuery('hoa phat'), '(HPG OR "Hòa Phát")');
  assert.equal(buildNewsSearchQuery('VNM'), '(VNM OR Vinamilk)');
  assert.equal(buildNewsSearchQuery('  FPT   Corporation  '), '(FPT OR "FPT Corporation")');
  assert.equal(buildNewsSearchQuery('XYZ Logistics'), '"XYZ Logistics"');
});

test('Google queries recognize multiple companies, avoid duplicate aliases and stay bounded', () => {
  const expanded = buildNewsSearchQuery('HPG FPT earnings');
  assert.ok(expanded.startsWith('(HPG OR'));
  assert.ok(expanded.includes('Hòa Phát'));
  assert.ok(expanded.includes('FPT Corporation'));
  const all = buildNewsSearchQuery(
    'HPG FPT VNM VCB BID CTG TCB MBB ACB VPB STB HDB SHB VIB TPB EIB LPB VIC VHM VRE MSN MWG PNJ SAB GAS PLX POW GVR HSG NKG DGC DPM DCM VJC HVN REE',
  );
  assert.ok(all.length <= 402);
});

test('ticker searches accept company names in either title or excerpt', () => {
  assert.equal(matchesNewsQuery({ title: 'Tập đoàn Hòa Phát tăng doanh thu' }, 'HPG'), true);
  assert.equal(
    matchesNewsQuery(
      { title: 'Kết quả kinh doanh', content: 'Vinamilk báo cáo lợi nhuận.' },
      'VNM',
    ),
    true,
  );
  assert.equal(matchesNewsQuery({ title: 'Hoa Phat Group reports results' }, 'HPG (HOSE)'), true);
});

test('name searches accept ticker aliases regardless of accents and case', () => {
  assert.equal(
    matchesNewsQuery({ title: 'HPG công bố kết quả' }, 'Công ty cổ phần Hòa Phát'),
    true,
  );
  assert.equal(matchesNewsQuery({ title: 'HÒA PHÁT mở rộng sản xuất' }, 'hoa phat'), true);
  assert.equal(matchesNewsQuery({ title: 'VNM tăng trưởng' }, 'vinamilk stock'), true);
});

test('one recognized company reference is sufficient for a multi-company query', () => {
  assert.equal(matchesNewsQuery({ title: 'Hòa Phát tăng sản lượng' }, 'HPG FPT'), true);
  assert.equal(matchesNewsQuery({ title: 'FPT reports earnings' }, 'HPG FPT'), true);
  assert.equal(matchesNewsQuery({ title: 'Vinamilk reports earnings' }, 'HPG FPT'), false);
});

test('ticker boundaries and full alias phrases reject unrelated partial matches', () => {
  for (const title of [
    'XHPG tăng giá',
    'HPG123 tăng giá',
    'Hoa Sen mở rộng',
    'Phát triển doanh nghiệp',
  ]) {
    assert.equal(matchesNewsQuery({ title }, 'HPG'), false, title);
  }
  assert.equal(matchesNewsQuery({ title: 'Company stock market news' }, 'HPG stock'), false);
  assert.equal(matchesNewsQuery({ title: 'Company stock news' }, 'company stock'), false);
  assert.equal(matchesNewsQuery({ title: 'Tin tức chứng khoán' }, 'công ty cổ phần'), false);
});

test('unknown company names require a complete phrase rather than scattered words', () => {
  assert.equal(
    matchesNewsQuery({ title: 'Đại Dương Xanh báo cáo lợi nhuận' }, 'Công ty Đại Dương Xanh'),
    true,
  );
  assert.equal(
    matchesNewsQuery({ title: 'Đại Dương đầu tư năng lượng xanh' }, 'Đại Dương Xanh'),
    false,
  );
  assert.equal(matchesNewsQuery({ title: 'XYZ công bố doanh thu' }, 'XYZ'), true);
  assert.equal(matchesNewsQuery({ title: 'XYZABC công bố doanh thu' }, 'XYZ'), false);
  assert.equal(
    matchesNewsQuery({ title: 'Đại Dương', content: 'Xanh hóa sản xuất' }, 'Đại Dương Xanh'),
    false,
  );
});
test('FPT parent-company news excludes FPT Retail and Shop-only stories', () => {
  assert.equal(matchesNewsQuery({ title: 'FPT Retail công bố doanh thu' }, 'FPT'), false);
  assert.equal(matchesNewsQuery({ title: 'FPT Shop tăng lợi nhuận' }, 'FPT'), false);
  assert.equal(
    matchesNewsQuery({ title: 'FPT Corporation và FPT Retail công bố kết quả' }, 'FPT'),
    true,
  );
});
