# FinScope — khảo sát và ánh xạ dữ liệu

Khảo sát trực tiếp ngày **15/10/2026**, từ mạng local. Endpoint được tìm trong tài nguyên công khai mà trang nguồn tải, sau đó gọi HTTP để xác minh tham số và phản hồi. Trạng thái này không đảm bảo endpoint tiếp tục hoạt động hoặc chấp nhận IP Cloud Run.

## Simplize

Trang đã kiểm tra: `https://simplize.vn/co-phieu/VNM`, `/so-lieu-tai-chinh`, `/tin-tuc`. Base URL trong JavaScript nguồn: `https://api2.simplize.vn`.

Tất cả endpoint dưới đây dùng GET; không dùng key, đăng nhập hoặc cookie riêng. Header: User-Agent và Referer `https://simplize.vn/`. JSON: `{status, message, data}`; phải kiểm tra cả HTTP status và `status` trong body.

| Nhóm | Endpoint / tham số đã kiểm tra | Phản hồi, ánh xạ | Độ mới / cache |
|---|---|---|---|
| Tìm kiếm | `/api/search/company/suggestions?q=VNM` | `ticker`, `name`, `stockExchange`, `type`; chỉ giữ cổ phiếu trên HOSE/HNX/UPCoM | Danh mục nguồn / cache bộ nhớ |
| Hồ sơ | `/api/company/summary/{ticker}` | `name`, `stockExchange`, `bcIndustryGroupId`, `bcIndustryGroupType`, `industryActivity`, `businessOverall`, `businessRisk`, `website` | `analysisUpdated`; cache 90 giây vì cùng response có giá |
| Giá / chỉ số nguồn | Cùng endpoint hồ sơ | `priceClose` VND; `pctChange` chia 100; `marketCap` VND; `roe`, `roa`, `dividendYieldCurrent` chia 100; `peRatio`, `pbRatio`, `epsRatio`, `bookValue`, `outstandingSharesValue` | `priceTimeStamp` là thời điểm giá, khác `analysisUpdated`. Kỳ tính các tỷ số hồ sơ chưa được công bố |
| BCTC và tỷ số | `/api/company/fi/ratio/{ticker}?period=Q&size=12` | `data.industryGroup`, `data.items[]` chứa `periodDate`, `periodDateName`, `is*`, `bs*`, `op*`. **Không chứa `cf*`** | Công bố theo kỳ; cache 6 giờ |
| LCTT | `/api/company/fi/cf/{ticker}?period=Q&size=12` | `cf*`; ghép bằng `periodDate`, không ghép theo vị trí mảng | Theo kỳ; 6 giờ |
| KQKD / CĐKT riêng | `/api/company/fi/is/{ticker}?type=null&period=Q&size=12`, tương tự `/bs/` | Đã xác minh để đối chiếu cấu trúc; runtime dùng `/ratio/` vốn chứa cùng các trường | Theo kỳ |
| Báo cáo năm | `/api/company/fi/ratio/{ticker}?period=Y&size=3`; `/cf/` tương tự | 3 năm công khai đã live test. Yêu cầu `size=5` hoặc quý `size=20` trả 401 yêu cầu đăng nhập: **không sử dụng** | 6 giờ |
| Peers | `/api/company/peer/{ticker}` | `data.peers[]`; tải hồ sơ để kiểm tra cùng `bcIndustryGroupId`, chọn tối đa 8 mã theo vốn hóa trong danh sách nguồn | 6 giờ |
| Cơ cấu sở hữu | `/api/company/ownership/ownership-breakdown/{ticker}` | `investorType`, `pctOfSharesOutHeldTier` đang là phần trăm | Ngày chốt chưa công bố / 6 giờ |
| Cổ đông | `/api/company/ownership/shareholder-fund-details/{ticker}?page=1&size=20` | `shareholderDetails[]`: `investorFullName`, `pctOfSharesOutHeld`, `sharesHeld`, `countryOfInvestor` | Ngày chốt chưa công bố. Tỷ lệ và số CP có thể khác thời điểm |
| Tin tức | `/api/company/news-event/list?ticker=VNM&isWl=false&page=1&size=15` | `id`, `title`, `description`, `createdDate`, `sourceNameDisplay`. `aiContent` của nguồn **không** được nhận là bản phân tích của FinScope | Cache 15 phút; lọc tối đa 90 ngày |
| Thị trường | `/api/company/summary/index/{ticker}` | VNINDEX, VN30, HNXINDEX đã trả dữ liệu; `priceClose`, `pctChange/100`. UPCOMINDEX chưa khả dụng: giữ null | Cache 90 giây; không tự gắn giờ giao dịch vì endpoint không cung cấp |
| Báo cáo CTCK / cổ tức / công bố / công ty con | JSON `#__NEXT_DATA__` trên trang `/co-phieu/{ticker}` | `analysisReports` (source, issueDate, attachedLink, targetPrice), `dividendPayment`, `companyNews`, `subCompany` | Trang công khai; cache 15 phút. CTCK chỉ giữ 180 ngày; ít nhất 2 báo cáo mới có phương pháp đồng thuận |

### Trường BCTC đã đối chiếu

Nhãn và phạm vi ngành đầy đủ được trích từ cấu hình bảng của frontend nguồn, lưu tại `api/app/fusion/source_fields.json`. Dữ liệu thô dùng **VND**, không chia tỷ ở backend.

| Chuẩn nội bộ | Trường nguồn |
|---|---|
| Doanh thu thuần, LN gộp, LN HĐKD | `is1`, `is2`, `is3` (áp dụng theo ngành) |
| Giá vốn, LNTT, LNST mẹ, LNST toàn DN, chi phí lãi | `is8` (chi phí âm), `is13`, `is14`, `is48`, `is51` |
| Tổng TS, TS ngắn hạn, nợ phải trả, nợ ngắn hạn, VCSH | `bs1`, `bs2`, `bs6`, `bs8`, `bs10` |
| Tiền, phải thu KH, tồn kho gộp, TSCĐ ròng, phải trả người bán | `bs13`, `bs21`, `bs30`, `bs46`, `bs74` |
| Vay ngắn/dài, lợi ích không kiểm soát | `bs83`, `bs95`, `bs116` |
| CFO, khấu hao, chi Capex, CFI, CFF | `cf1`, `cf3`, `cf23` (chi âm), `cf22`, `cf30` |
| P/E, P/B lịch sử nguồn công bố | `op1`, `op2` |
| ROE LTM, ROA LTM nguồn công bố | `op17/100`, `op18/100` |
| NIM, CIR, CASA, NPL, LLR ngân hàng | `op10/100`, `op13/100`, `op40/100`, `op41/100`, `op42/100`; số 0 không có bằng chứng được giữ thiếu |
| Số CP cuối kỳ | `op49`: đã đối chiếu giá trị thô khoảng 2,09 tỷ CP VNM với hồ sơ; **không nhân thêm 1 triệu** dù nhãn hiển thị của nguồn có “Triệu CP” |

Phạm vi hợp nhất/riêng lẻ và kiểm toán **chưa được JSON Simplize cung cấp**. Giữ `source_unspecified`; không gán nhãn “đã kiểm toán”, không đối chiếu BCTC hai nguồn như cùng phạm vi nếu chưa có bằng chứng.

## Vietstock

Base `https://finance.vietstock.vn`. Lấy trang chủ GET `/`, parse input `__RequestVerificationToken`, giữ cookie trong AsyncClient rồi POST form. Chuỗi lấy token và POST được khóa cùng nhau để tránh lẫn phiên. Không đăng nhập.

| Endpoint | Tham số | Ánh xạ đã kiểm tra |
|---|---|---|
| `/data/GetStockDeal_OverviewTrading` | `stockCode`, token; Referer trang chủ, X-Requested-With XMLHttpRequest | `data[0]`: `StockCode`, `TradingDate` dạng `/Date(milliseconds)/`, `ClosePrice` VND, `PerChange/100`, `TotalVol`; có `ForeignBuyVal`, `ForeignSellVal`, `ProBuyVal`, `ProSellVal` trong response |
| `/data/financeinfo` | `Code`, Page=1, PageSize=8, ReportTermType=2 (quý) hoặc 1 (năm), ReportType=BCTQ, Unit=1000000000, token | Mảng `[periods, groups]`. Ghép bằng `period.ID` → `Value{ID}`; **không** ghép theo thứ tự mảng. BCTC trả tỷ VND, nhân 1e9. Ratio/EPS không nhân tỷ |

`United=HN`, `AuditedStatus=SX/CKT` được giữ nguyên trong BCTC đối chiếu; không dịch sang nhãn chưa xác minh. BCTC overview chỉ là tóm lược, không đủ tất cả số vòng quay. `NameEn=Trailing EPS` là EPS 4 quý, VND/CP, dùng đúng kỳ khi chưa có số CP bình quân gia quyền để tự tính EPS. Giá được ưu tiên Vietstock trước Simplize, Yahoo. URL `/{ticker}.htm` đơn lẻ trả 404: **runtime không dùng URL này**.

Các endpoint OHLCV, tin, sự kiện khác đã thấy trong tài nguyên trang nhưng chưa xác minh đầy đủ tham số/body: `TODO(verify)`, không gọi đoán trong sản phẩm. Dữ liệu khối ngoại/tự doanh là cơ hội bổ sung UI, chưa coi là chuỗi lịch sử hoàn chỉnh.

## Yahoo Finance

GET `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.VN?range=1y&interval=1d`. Không key/cookie, User-Agent. Đã kiểm tra hồ sơ/giá cho VNM, FPT, VCB, HPG, SSI, VHM. VEF.VN không có kết quả: trả bảng/biểu đồ trống kèm trạng thái nguồn.

`chart.result[0].meta.regularMarketPrice/regularMarketTime` để đối chiếu giá; `timestamp[]` ghép **cùng index** với `indicators.quote[0].open/high/low/close/volume`. Timestamp đổi Asia/Ho_Chi_Minh. Close không bị tự coi là adjusted close; biểu đồ không tuyên bố đã điều chỉnh toàn bộ chia tách/cổ tức.

## Quy tắc phối hợp

- Giá chỉ so chênh lệch >0,5% khi cùng ngày; khác thời điểm vẫn lưu alternate nhưng không phát cảnh báo số học sai.
- BCTC >1% chỉ được đánh dấu khi cùng kỳ/phạm vi; hiện bảng Vietstock được đặt riêng để người dùng kiểm tra phạm vi.
- Tỷ số tự tính đối chiếu `op*` cùng kỳ, lệch >5% có cảnh báo và hiện hai giá trị. P/E, P/B hiện tại không phát cảnh báo số học với multiple lịch sử cuối quý vì khác thời điểm giá.
- Đơn vị tiền VND, tỷ lệ decimal, missing=null. UI mới format tỷ đồng/%.
- Không nguồn nào có dữ liệu: 503; mã xác minh không tồn tại: 404. Không dùng fixture cho runtime.

## AI, miễn phí và robots

Catalog [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) đã được kiểm tra; chỉ allowlist `gemini-2.5-flash`, `gemini-2.5-flash-lite`. Hạn mức phụ thuộc project/tier, xem [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) và AI Studio; không tự gán RPM/TPD chưa biết cho key. Structured JSON theo [tài liệu Google](https://ai.google.dev/gemini-api/docs/structured-output). Không bật grounding hoặc dịch vụ trả phí. Model có free tier không tự chứng minh project key đang ở free tier; cấu hình billing thuộc tài khoản người dùng.

Đã đọc robots.txt ba nguồn. Simplize chặn `/news/*` với bot chung: runtime chỉ đọc mô tả JSON công khai, không crawl toàn văn. Link tin hiện dẫn tới danh sách tin theo mã vì endpoint không cung cấp URL gốc đã xác minh. Trích mô tả quá ngắn thì báo thiếu; không viết đệm để đủ 120 từ.

