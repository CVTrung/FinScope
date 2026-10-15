# agent.md — Dashboard phân tích & tổng hợp tài chính doanh nghiệp Việt Nam

> Tài liệu hướng dẫn cho coding agent. Đọc toàn bộ trước khi viết code. Khi có mâu thuẫn, mục **2 (Quyết định đã chốt)** và mục **3 (Yêu cầu giảng viên)** có ưu tiên cao nhất.

---

## 1. Vai trò & nguyên tắc làm việc

Bạn là kỹ sư full-stack xây dựng web app **tra cứu, phân tích, so sánh định giá doanh nghiệp niêm yết tại Việt Nam** (HOSE/HNX/UPCoM), phục vụ **đồ án học tập cá nhân, không thương mại hóa**.

Nguyên tắc:

1. **Đúng trước, đẹp sau.** MVP phải cho số liệu chính xác, có nguồn, có thời điểm. Không hiển thị số không truy xuất được.
2. **Bảng và biểu đồ trước, chữ sau.** Văn bản AI chỉ bổ trợ.
3. **Không bịa.** Không tự đoán endpoint, tên trường, công thức. Endpoint phải được khảo sát thực tế (Phase 0) và ghi vào `docs/data-mapping.md`. Chưa xác minh thì ghi `TODO(verify)`, không giả định.
4. **AI không tự tính số.** Mọi con số (hệ số, vùng giá, điểm) do backend tính bằng code. AI chỉ diễn giải số đã được cung cấp.
5. **Chịu lỗi từng phần.** Một nguồn hoặc một model lỗi không được làm sập cả trang.
6. **Ưu tiên miễn phí.** Nếu một tính năng bắt buộc dùng API trả phí, **dừng lại, nói rõ trong báo cáo** (tên dịch vụ, vì sao cần, chi phí), và đề xuất phương án miễn phí thay thế. Không tự ý tích hợp dịch vụ trả phí.
7. Làm theo phase ở mục 17. Hết mỗi phase phải chạy được và tự kiểm tra theo checklist trước khi sang phase sau.

---

## 2. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Phạm vi | **Chỉ doanh nghiệp Việt Nam** (HOSE, HNX, UPCoM). Không hỗ trợ mã quốc tế |
| Nguồn dữ liệu | **Vietstock, Simplize, Yahoo Finance** (hậu tố `.VN`), **phối hợp và đối chiếu** giữa các nguồn |
| Cách lấy dữ liệu | Crawl / gọi endpoint mà trang web tải ra (xem Network trong DevTools). **Ưu tiên miễn phí** (mục 1.6) |
| Lưu trữ | **Không database.** Lấy dữ liệu trực tiếp mỗi lần query. Cache trong bộ nhớ instance (TTL ngắn) |
| Lưu phía người dùng | **Chỉ `localStorage`** (watchlist, lịch sử tìm kiếm, theme). **Không đăng nhập** |
| Backend | **Python 3.12 + FastAPI** (async) |
| Frontend | Next.js + TypeScript + Tailwind |
| AI | **Gemini API (free tier)**. Fallback **chỉ trong các model Gemini miễn phí** (mục 11) |
| Triển khai | **Google Cloud Run**, 2 service (`web`, `api`), stateless |
| Mục đích | Cá nhân, học tập, nộp đồ án. Không thương mại hóa |
| Ngôn ngữ UI | Tiếng Việt. Giao diện sáng/tối |
| Ưu tiên MVP | **Hoạt động đúng + tận dụng đầy đủ dữ liệu + AI** (không làm Screener, đăng nhập, realtime tick) |

---

## 3. Yêu cầu từ giảng viên (bắt buộc, dùng làm checklist nghiệm thu)

| # | Yêu cầu | Đáp ứng ở | Tiêu chí đạt |
|---|---|---|---|
| G1 | Hệ số tài chính phải có **ROE, ROA, các chỉ số vòng quay, P/E, P/B** | Tab **Hệ số** (mục 9) | Có đủ ROE, ROA, vòng quay tổng tài sản/hàng tồn kho/phải thu/phải trả/TSCĐ, P/E, P/B; có xu hướng theo kỳ; có cột TB ngành |
| G2 | **Phân tích AI** | Tab **Phân tích AI** (mục 12) | Có đủ các mục G2a–G2d |
| G2a | **Điểm mạnh, điểm yếu** | Tab AI | Bảng, mỗi dòng có chỉ số chứng minh và so với ngành |
| G2b | **Vùng mua / vùng bán** | Tab AI + biểu đồ giá | Vùng giá cụ thể, căn cứ, mức tin cậy; tính bằng code (mục 10) |
| G2c | **So sánh với trung bình ngành** | Tab AI, Hệ số, So sánh | Bảng DN vs trung vị/TB ngành, chênh lệch, đánh giá |
| G2d | **Điểm cần theo dõi** (và điểm tổng hợp) | Tab AI + header | Bảng "điểm cần theo dõi" có ngưỡng cảnh báo; kèm điểm AI 0–100 trên header |
| G3 | Mỗi bản tin **tóm tắt đủ ý, không chỉ 1 câu** | Tab Tin tức (mục 13) | Mỗi tin 120–200 từ, 5 phần có cấu trúc |

> Ghi chú: "phân tích theo dõi điểm" được hiểu là **cả hai**: bảng **điểm cần theo dõi** và **điểm tổng hợp** của doanh nghiệp. Nếu giảng viên chỉ cần một, ẩn bớt bằng cờ cấu hình, không xóa code.

---

## 4. Kiến trúc

```
Browser (Next.js, Cloud Run: web)
   │  fetch /api/*  (gọi trực tiếp domain của api, có CORS cho domain web)
   ▼
Cloud Run: api (FastAPI)
   1. Nhận query theo ticker
   2. Gọi song song 3 nguồn (asyncio.gather, timeout riêng từng nguồn)
   3. Fusion: ánh xạ mã → chuẩn hóa → căn kỳ → đối chiếu → chọn giá trị
   4. Tính hệ số, định giá, trung bình ngành, vùng mua/bán, điểm
   5. Gọi Gemini (fallback trong họ Gemini free) → tóm tắt / phân tích (JSON schema)
   6. Trả JSON (có thể stream bằng SSE cho phần AI)
   Cache: TTLCache trong bộ nhớ instance + single-flight chống gọi trùng
   │
   ├─► Vietstock    ├─► Simplize    ├─► Yahoo Finance
```

Quy tắc kiến trúc:

- Frontend **không bao giờ** gọi trực tiếp 3 nguồn dữ liệu hay Gemini (CORS, lộ key, bị chặn).
- API **stateless**. Không ghi file/ DB. Mất cache khi instance tắt là chấp nhận được.
- Mỗi tab gọi endpoint riêng (lazy load), hiện skeleton trong lúc chờ.
- Danh sách so sánh nằm trong URL (`/compare?tickers=VNM,MWG,FPT`) để chia sẻ được.

---

## 5. Cấu trúc thư mục

```
.
├── agent.md
├── README.md                    # hướng dẫn chạy local + deploy + bản báo cáo ngắn cho đồ án
├── docker-compose.yml           # chạy local web + api
├── docs/
│   ├── data-mapping.md          # bảng endpoint + trường của 3 nguồn (kết quả Phase 0)
│   ├── formulas.md              # công thức hệ số (mục 9)
│   └── decisions.md             # nhật ký quyết định, các điểm TODO(verify)
├── api/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, middleware, health
│   │   ├── config.py            # đọc env (pydantic-settings)
│   │   ├── deps.py
│   │   ├── routers/
│   │   │   ├── search.py
│   │   │   ├── company.py       # overview, financials, ratios, valuation, ownership, events
│   │   │   ├── news.py
│   │   │   ├── analysis.py      # AI analysis (JSON + SSE)
│   │   │   ├── compare.py
│   │   │   └── system.py        # /health, /sources/status
│   │   ├── connectors/
│   │   │   ├── base.py          # interface + retry + timeout + rate limit
│   │   │   ├── vietstock.py
│   │   │   ├── simplize.py
│   │   │   └── yahoo.py
│   │   ├── fusion/
│   │   │   ├── symbols.py       # ánh xạ mã ↔ ID từng nguồn
│   │   │   ├── normalize.py     # đơn vị, ngày, kỳ báo cáo
│   │   │   ├── reconcile.py     # đối chiếu + chọn giá trị + provenance
│   │   │   └── priority.py      # bảng ưu tiên nguồn theo loại dữ liệu
│   │   ├── analytics/
│   │   │   ├── ratios.py        # ROE, ROA, vòng quay, DuPont, CCC...
│   │   │   ├── valuation.py     # P/E, P/B band, fair price
│   │   │   ├── industry.py      # trung vị ngành từ peers
│   │   │   ├── zones.py         # vùng mua/bán
│   │   │   ├── scoring.py       # điểm 0–100, điểm mạnh/yếu rule-based
│   │   │   └── watchlist_flags.py  # điểm cần theo dõi
│   │   ├── ai/
│   │   │   ├── client.py        # Gemini + fallback chain
│   │   │   ├── prompts/         # *.md (prompt tiếng Việt, có version)
│   │   │   ├── schemas.py       # Pydantic schema đầu ra AI
│   │   │   ├── guard.py         # kiểm tra số/nguồn trong output AI
│   │   │   └── news_pipeline.py # lấy nội dung bài, khử trùng lặp, tóm tắt
│   │   ├── models/              # Pydantic: Field, Provenance, các response
│   │   └── core/
│   │       ├── cache.py         # TTLCache + single-flight
│   │       ├── http.py          # httpx.AsyncClient dùng chung, UA, headers
│   │       └── errors.py
│   └── tests/
│       ├── fixtures/            # response mẫu đã lưu của 3 nguồn
│       └── test_*.py
└── web/
    ├── Dockerfile               # output: 'standalone'
    ├── package.json
    ├── next.config.js
    └── src/
        ├── app/                 # routes: /, /company/[ticker], /compare, /watchlist, /news
        ├── components/
        │   ├── layout/          # AppShell, TickerSearch, TabNav, ThemeToggle
        │   ├── data/            # DataTable, KpiStrip, FinancialStatementTable, RatioTable
        │   ├── charts/          # xem mục 14
        │   ├── source/          # SourceBadge, FreshnessIndicator, DataDiscrepancyAlert, PartialDataBanner
        │   ├── ai/              # AiSummaryCard, NewsDigestCard, ZoneBar, WatchPointsTable, AiModelBadge
        │   └── states/          # Skeleton, EmptyState, ErrorState
        ├── lib/                 # api client, format (số, %, tỷ đồng), localStorage hooks
        ├── hooks/
        └── types/               # kiểu TS khớp schema API
```

---

## 6. Nguồn dữ liệu & chính sách lấy dữ liệu

### 6.1 Nguyên tắc

- **Phase 0 là bắt buộc**: mở từng trang của 3 nguồn, dùng DevTools/Network để tìm endpoint JSON mà trang tự gọi. Với mỗi endpoint ghi vào `docs/data-mapping.md`: URL, phương thức, tham số, header/cookie/token cần, cấu trúc phản hồi, trường tương ứng schema chuẩn, tần suất cập nhật.
- Ưu tiên gọi endpoint JSON. Chỉ parse HTML khi không có JSON. **Không dùng headless browser** (nặng, cold start chậm trên Cloud Run). Nếu một dữ liệu chỉ lấy được bằng headless browser thì ghi vào `decisions.md` và bỏ qua dữ liệu đó trong MVP.
- Nếu endpoint cần **API key / trả phí / đăng nhập**: ghi rõ trong `docs/decisions.md` ("Cần trả phí: …"), **không tích hợp**, dùng nguồn khác trong 3 nguồn để thay thế hoặc để trống kèm `PartialDataBanner`.
- Một số endpoint Vietstock thường yêu cầu cookie phiên và token chống giả mạo form. Nếu đúng vậy, connector phải tự lấy token/cookie từ trang trước khi gọi và làm mới khi hết hạn. Xác minh bằng quan sát thực tế, không giả định.
- Yahoo Finance: dùng thư viện `yfinance` hoặc endpoint công khai. Mã VN dùng hậu tố `.VN` (ví dụ `VNM.VN`). Độ phủ BCTC mã VN hạn chế nên chủ yếu dùng cho **giá lịch sử** và **đối chiếu**.
- Cư xử lịch sự với nguồn: User-Agent hợp lý, giới hạn tốc độ (tối đa ~2–3 request/giây/nguồn), cache, không gọi lặp. Đây là dự án học tập, tuân thủ `robots.txt` và điều khoản nếu có thể.

### 6.2 Bản đồ dữ liệu cần khai thác (tận dụng tối đa)

| Nhóm dữ liệu | Ưu tiên 1 | Đối chiếu / bổ sung |
|---|---|---|
| Hồ sơ DN: ngành, sàn, lịch sử, ban lãnh đạo, công ty con/liên kết | Vietstock | Simplize |
| Giá hiện tại, thay đổi, khối lượng | Vietstock | Simplize, Yahoo |
| Giá lịch sử OHLCV | Yahoo (`.VN`) | Vietstock, Simplize |
| BCTC: CĐKT, KQKD, LCTT (quý, năm, hợp nhất) | Vietstock | Simplize |
| Chỉ số tài chính do nguồn công bố | Simplize, Vietstock | Dùng để **đối chiếu** với số tự tính |
| Định giá: P/E, P/B, P/S, EV/EBITDA, EPS, BVPS | **Tự tính** | Simplize, Vietstock, Yahoo |
| Giá mục tiêu, khuyến nghị CTCK | Simplize | Yahoo (nếu có) |
| Cổ đông lớn, sở hữu nước ngoài, giao dịch nội bộ | Vietstock | Simplize |
| Giao dịch khối ngoại, tự doanh | Vietstock | Simplize |
| Cổ tức, ĐHCĐ, phát hành, chia tách | Vietstock | Simplize |
| Tin tức doanh nghiệp, tin ngành | Gộp cả 3 | Gemini grounding (bổ sung) |
| Báo cáo phân tích, ngành, vĩ mô | Simplize | — |
| Peers cùng ngành, chỉ số ngành | Simplize | Vietstock |

Nếu phát hiện thêm loại dữ liệu hữu ích trên 3 nguồn (ví dụ lịch sử P/E theo ngày, kế hoạch kinh doanh năm, cơ cấu doanh thu theo sản phẩm/khu vực, thông tin trái phiếu, dữ liệu vĩ mô), **thêm vào `data-mapping.md` và đề xuất đưa vào UI**.

---

## 7. Data Fusion (phối hợp dữ liệu giữa các nguồn)

### 7.1 Pipeline

| Bước | Việc làm |
|---|---|
| 1. Ánh xạ mã | `symbols.py`: `VNM` ↔ `VNM.VN` ↔ ID nội bộ của từng nguồn. Mã không tồn tại trả 404 rõ ràng |
| 2. Chuẩn hóa | Tiền: lưu **VND** (số nguyên/float) rồi mới format tỷ/triệu ở UI. Tỷ lệ: số thập phân (0.253, không phải 25.3). Ngày: ISO 8601, múi giờ `Asia/Ho_Chi_Minh` |
| 3. Căn kỳ | Cùng kỳ (Q2/2026), cùng phạm vi (hợp nhất/riêng lẻ), cùng trạng thái (đã soát xét/kiểm toán/chưa) |
| 4. Đối chiếu | So từng trường giữa các nguồn, lệch quá ngưỡng thì `discrepancy = true` |
| 5. Chọn giá trị | Theo bảng ưu tiên ở 6.2. Nguồn ưu tiên thiếu → nguồn kế tiếp |
| 6. Provenance | Mỗi trường giữ `chosen_source`, `alternates`, `fetched_at`, `period` |

### 7.2 Ngưỡng lệch (cấu hình trong `config.py`)

| Loại | Ngưỡng |
|---|---|
| Giá | > 0.5% |
| Số liệu BCTC | > 1% |
| Hệ số / multiple | > 5% (thường do khác kỳ TTM hoặc khác cách tính bình quân) |

### 7.3 Cấu trúc trường sau hợp nhất (dùng thống nhất toàn hệ thống)

```json
{
  "field": "roe",
  "value": 0.253,
  "unit": "ratio",
  "period": "TTM-2026Q2",
  "scope": "consolidated",
  "chosen_source": "calculated",
  "alternates": [
    {"source": "simplize", "value": 0.248},
    {"source": "vietstock", "value": 0.251}
  ],
  "discrepancy": false,
  "note": null,
  "fetched_at": "2026-10-15T14:45:00+07:00"
}
```

Mọi response của API bọc dữ liệu theo dạng này (hoặc mảng các trường dạng này) để UI luôn hiển thị được nguồn và thời điểm.

### 7.4 Khi dữ liệu thiếu hoặc lỗi

- Nguồn lỗi/timeout: bỏ qua nguồn đó, trả `meta.sources_status = {"vietstock":"ok","simplize":"timeout","yahoo":"ok"}`; UI hiện `PartialDataBanner`.
- Một trường không nguồn nào có: `value = null`, `note = "Không có dữ liệu"`. UI hiển thị `—`, không điền 0.
- Không nguồn nào trả lời: HTTP 503 với thông điệp rõ ràng và nút thử lại.

---

## 8. Quy ước dữ liệu & hiển thị nguồn/timeline

Mỗi số liệu hiển thị phải truy xuất được:

| Trường | Ví dụ |
|---|---|
| Giá trị | 25.3% |
| Kỳ báo cáo | TTM đến Q2/2026 (hợp nhất) |
| Nguồn | `Tự tính` + `Simplize` + `Vietstock` (SourceBadge) |
| Thời điểm lấy | 15/10/2026 14:45 (FreshnessIndicator) |

**Timeline hợp nhất** (`EventTimeline`): gộp tin tức, công bố BCTC, cổ tức, ĐHCĐ, phát hành, khuyến nghị CTCK, giao dịch nội bộ lớn. Sắp theo thời gian giảm dần, lọc theo loại/nguồn. Tin trùng giữa các nguồn được **khử trùng lặp** (chuẩn hóa tiêu đề + cửa sổ thời gian ± 24h + độ tương đồng chuỗi, ví dụ ngưỡng 0.85) và gộp thành 1 mục có nhiều badge nguồn.

---

## 9. Hệ số tài chính (G1) và công thức

Tự tính từ BCTC thô (nhất quán công thức), sau đó đối chiếu với số các nguồn công bố. Lưu công thức chính thức tại `docs/formulas.md` và viết unit test cho từng công thức.

### 9.1 Quy ước tính

- **TTM** = tổng 4 quý gần nhất với chỉ tiêu dòng chảy (doanh thu, LNST, CFO…). Chỉ tiêu tồn lượng (tài sản, vốn) lấy cuối kỳ.
- Các hệ số có mẫu số là tồn lượng (ROE, ROA, vòng quay) dùng **bình quân đầu kỳ và cuối kỳ** (mặc định: bình quân 2 điểm; có tùy chọn bình quân 5 điểm cho quý nếu đủ dữ liệu). Ghi rõ cách dùng trong `note`.
- LNST dùng **LNST của cổ đông công ty mẹ** cho ROE/EPS khi có.
- Mẫu số bằng 0 hoặc thiếu dữ liệu → `null`, không chia.

### 9.2 Danh sách hệ số

| Nhóm | Chỉ số | Công thức |
|---|---|---|
| **Sinh lời** | **ROE** | LNST cổ đông mẹ (TTM) / Vốn CSH bình quân |
| | **ROA** | LNST (TTM) / Tổng tài sản bình quân |
| | ROS (biên LN ròng) | LNST / Doanh thu thuần |
| | Biên LN gộp | LN gộp / Doanh thu thuần |
| | Biên LN hoạt động | LN từ HĐKD / Doanh thu thuần |
| | Biên EBITDA | EBITDA / Doanh thu thuần |
| **DuPont** | ROE = ROS × Vòng quay tổng TS × Đòn bẩy | Đòn bẩy = Tổng TS bình quân / Vốn CSH bình quân |
| **Vòng quay (hiệu quả hoạt động)** | **Vòng quay tổng tài sản** | Doanh thu thuần / Tổng TS bình quân |
| | **Vòng quay hàng tồn kho** | Giá vốn hàng bán / Hàng tồn kho bình quân |
| | **Vòng quay khoản phải thu** | Doanh thu thuần / Phải thu ngắn hạn KH bình quân |
| | **Vòng quay khoản phải trả** | Giá vốn hàng bán / Phải trả người bán bình quân |
| | **Vòng quay TSCĐ** | Doanh thu thuần / TSCĐ ròng bình quân |
| **Chu kỳ tiền** | DIO, DSO, DPO | 365 / vòng quay tương ứng (với TTM năm) |
| | **CCC** | DIO + DSO − DPO |
| **Thanh khoản** | Hiện hành | TS ngắn hạn / Nợ ngắn hạn |
| | Nhanh | (TS ngắn hạn − Hàng tồn kho) / Nợ ngắn hạn |
| | Tiền | (Tiền + tương đương tiền) / Nợ ngắn hạn |
| **Đòn bẩy** | Nợ / Vốn CSH | Tổng nợ / Vốn CSH |
| | Nợ vay ròng / EBITDA | (Nợ vay − Tiền) / EBITDA TTM |
| | Khả năng trả lãi | EBIT / Chi phí lãi vay |
| **Tăng trưởng** | Doanh thu, LNST, EPS | YoY, QoQ, CAGR 3 và 5 năm |
| **Dòng tiền** | CFO, FCF, CFO/LNST | FCF = CFO − Capex |
| **Định giá** | **P/E** | Giá / EPS (TTM). EPS = LNST cổ đông mẹ / CP lưu hành bình quân |
| | **P/B** | Giá / BVPS. BVPS = Vốn CSH cổ đông mẹ / CP lưu hành |
| | P/S | Vốn hóa / Doanh thu TTM |
| | EV/EBITDA | (Vốn hóa + Nợ vay − Tiền) / EBITDA TTM |
| | PEG | P/E / Tăng trưởng EPS (CAGR, %) — chỉ tính khi tăng trưởng > 0 |
| | Dividend yield | Cổ tức tiền mặt 12 tháng / Giá |

### 9.3 Ngành đặc thù (bắt buộc xử lý)

Ngân hàng, chứng khoán, bảo hiểm có cấu trúc BCTC khác (không có hàng tồn kho, giá vốn…).

| Nhóm ngành | Xử lý |
|---|---|
| Ngân hàng | Ưu tiên ROE, ROA, P/B, NIM, CIR, nợ xấu (NPL), LLR, CASA, tăng trưởng tín dụng nếu nguồn có. Các vòng quay hàng tồn kho/phải thu → `null`, ghi `note = "Không áp dụng cho ngân hàng"`. Không tính EV/EBITDA |
| Chứng khoán, bảo hiểm | Ưu tiên ROE, ROA, P/B, P/E. Các chỉ số không áp dụng → `null` kèm lý do |
| Còn lại | Bộ chỉ số đầy đủ |

Backend cần cờ `industry_group` để chọn bộ chỉ số. UI **không hiển thị 0 hay lỗi** với chỉ số không áp dụng mà hiển thị `N/A` + tooltip lý do.

### 9.4 Bảng hệ số trên UI

Cột: **Chỉ số | Hiện tại | Kỳ trước | Cùng kỳ năm trước | TB 3 năm | TB/Trung vị ngành | Đánh giá | Nguồn**.
Cột Đánh giá có 3 mức (Tốt/Trung bình/Kém) theo so với ngành và chiều tốt-xấu của từng chỉ số (ví dụ P/E thấp hơn ngành = rẻ hơn, nợ/vốn thấp hơn = tốt hơn). Có toggle Quý/Năm và nút xuất CSV.

---

## 10. Định giá, trung bình ngành, vùng mua/bán (G2b, G2c)

### 10.1 Trung bình ngành (`analytics/industry.py`)

1. Lấy trực tiếp chỉ số ngành từ Simplize/Vietstock nếu có.
2. Nếu không: lấy danh sách peers cùng ngành (ưu tiên cùng phân ngành cấp 2), **tối đa 8 peers** theo vốn hóa, tải song song với giới hạn đồng thời (semaphore 4), cache TTL dài hơn (vài giờ).
3. Tính **trung vị** (chính) và trung bình (phụ). Loại giá trị ngoại lai (P/E âm hoặc > 100) trước khi tính.
4. UI ghi rõ: cách tính, số peers, danh sách peers, kỳ dữ liệu.
5. Nếu < 3 peers có dữ liệu: hiển thị cảnh báo "mẫu ngành nhỏ, độ tin cậy thấp".

### 10.2 Lịch sử multiple (cho band ±1σ, ±2σ)

Không có DB nên dựng lại từ dữ liệu nhiều kỳ: P/E, P/B theo quý trong 3–5 năm = giá cuối quý / EPS TTM (hoặc BVPS) của quý đó. Nếu nguồn có sẵn chuỗi lịch sử P/E, P/B thì dùng và đối chiếu.

### 10.3 Vùng mua/bán (`analytics/zones.py`)

Backend tính, tham số lấy từ `config.py`. **AI không tạo con số.**

| Phương pháp | Giá hợp lý | Ghi chú |
|---|---|---|
| A. P/E | EPS TTM × P/E mục tiêu | P/E mục tiêu = trung vị P/E 3–5 năm của chính DN, đối chiếu P/E trung vị ngành |
| B. P/B | BVPS × P/B mục tiêu | Ưu tiên cho ngân hàng/tài chính |
| C. Kỹ thuật | Hỗ trợ/kháng cự từ đáy–đỉnh 52 tuần, MA50, MA200 | Chỉ để tham chiếu, trọng số thấp |
| D. Đồng thuận CTCK | Trung vị giá mục tiêu | Bỏ qua nếu < 2 khuyến nghị |

Cách kết hợp:

```
fair_mid  = trung bình có trọng số của các giá hợp lý khả dụng (mặc định A:0.4, B:0.3, D:0.3; C chỉ dùng làm biên)
Vùng mua  = [max(hỗ trợ kỹ thuật, fair_mid × 0.75), fair_mid × 0.85]
Vùng giữ  = (fair_mid × 0.85, fair_mid × 1.10)
Vùng bán  = [fair_mid × 1.10, fair_mid × 1.25 hoặc kháng cự gần nhất]
```

(Ngưỡng 0.85, 1.10... là mặc định, cấu hình được và ghi rõ trên UI.)

Độ tin cậy:

| Mức | Điều kiện |
|---|---|
| Cao | ≥ 3 phương pháp khả dụng và hệ số biến thiên giữa các giá hợp lý < 15% |
| Trung bình | 2 phương pháp, hoặc biến thiên 15–30% |
| Thấp | 1 phương pháp, biến thiên > 30%, hoặc dữ liệu EPS âm/thiếu |

Nếu EPS ≤ 0: không dùng phương pháp P/E; thông báo rõ.
Kết quả trả về: các vùng giá, từng giá hợp lý theo phương pháp, trạng thái hiện tại (`in_buy_zone` / `hold` / `in_sell_zone`), độ tin cậy, danh sách giả định.

### 10.3.1 Hiển thị

`ZoneBar`: thanh ngang có vạch giá hiện tại; biểu đồ giá có dải màu xanh (mua), vàng (giữ), đỏ (bán); `FootballFieldChart` thể hiện khoảng giá hợp lý theo từng phương pháp.

---

## 11. AI (Gemini free + fallback)

### 11.1 Cấu hình

```
GEMINI_API_KEY=...                       # lưu Secret Manager trên Cloud Run
GEMINI_MODEL_CHAIN=gemini-2.5-flash,gemini-2.5-flash-lite   # thứ tự thử, chỉ model free tier
AI_TIMEOUT_SECONDS=60
AI_MAX_RETRIES_PER_MODEL=1
```

- **Chỉ dùng model Gemini có free tier.** Trước khi code, kiểm tra tài liệu Gemini API hiện hành để xác nhận tên model, hạn mức (RPM, TPD) và model nào còn miễn phí; cập nhật `GEMINI_MODEL_CHAIN` cho phù hợp. Danh sách trên chỉ là mặc định, không được coi là đã xác minh.
- Không dùng model trả phí, không thêm provider khác (OpenAI, Anthropic…).
- Tìm kiếm bổ sung (grounding bằng Google Search): chỉ bật nếu free tier cho phép. Nếu không, bỏ phần "nguồn bổ sung" và ghi vào `decisions.md`.

### 11.2 Chuỗi fallback

```
Model #1 ── lỗi 429/5xx/timeout/JSON sai schema ──▶ retry 1 lần (backoff + jitter)
        └─ vẫn lỗi ──▶ Model #2 ──▶ ... ──▶ hết chuỗi
                                              ▼
              Trả kết quả cache gần nhất (nếu có) hoặc ẩn phần AI + banner cảnh báo
```

- Lỗi `429` (hết quota): chuyển model ngay, không retry cùng model.
- Ghi log mỗi lần chuyển model; UI hiện `AiModelBadge` (model đã dùng, có đánh dấu "dự phòng").
- Cache kết quả AI theo `hash(prompt_version + input_data)` trong bộ nhớ, TTL vài giờ, để tiết kiệm quota.
- Giới hạn quota: hàng đợi nhẹ + semaphore (ví dụ tối đa 2 lời gọi AI đồng thời) và rate limit theo IP phía API.

### 11.3 Ràng buộc đầu ra

- Đầu ra **JSON theo schema** (dùng structured output/response schema của Gemini + validate bằng Pydantic). Sai schema → retry/fallback.
- Viết bằng **tiếng Việt**, văn phong phân tích, trung lập.
- `guard.py` kiểm tra sau khi AI trả:
  - Mọi con số trong văn bản phải nằm trong tập số đã cung cấp (so khớp với sai số làm tròn). Số lạ → loại câu đó hoặc retry.
  - Mỗi nhận định phải trỏ tới `evidence` (tên chỉ số hoặc `source_url`).
  - Cấm từ ngữ khuyến nghị tuyệt đối ("chắc chắn tăng", "nên mua ngay"). Dùng ngôn ngữ xác suất, điều kiện.
- Prompt đặt trong `ai/prompts/*.md`, có số phiên bản (`prompt_version`) để cache và truy vết.

---

## 12. Tab Phân tích AI (G2)

### 12.1 Dữ liệu đầu vào cho AI

Backend gom thành một gói facts đã chuẩn hóa: hệ số (kèm lịch sử và so với ngành), vùng mua/bán đã tính, điểm số rule-based, danh sách tin đã tóm tắt, sự kiện sắp tới, giá mục tiêu CTCK. AI **chỉ nhận gói này**, không tự tra thêm số.

### 12.2 Bố cục tab

| Khối | Nội dung | Hiển thị |
|---|---|---|
| Tóm tắt nhanh | 5–8 câu về bức tranh tổng thể (hiệu quả, tăng trưởng, sức khỏe tài chính, định giá) | Card + **điểm tổng hợp 0–100** |
| **Điểm mạnh** | Nhận định + chỉ số chứng minh + vị thế so với ngành | Bảng |
| **Điểm yếu** | Như trên | Bảng |
| **So sánh với TB ngành** | Chỉ số, DN, trung vị ngành, chênh lệch %, đánh giá | Bảng tô màu + Radar |
| **Vùng mua / vùng bán** | Vùng giá, căn cứ từng phương pháp, độ tin cậy, trạng thái hiện tại | `ZoneBar` + bảng + biểu đồ giá có dải |
| **Điểm cần theo dõi** | Hạng mục, lý do, chỉ báo, **ngưỡng cảnh báo**, giá trị hiện tại, mốc thời gian | Bảng |
| Rủi ro | Rủi ro chính, mức độ (cao/TB/thấp), nguồn gốc | Bảng |

Cố định cuối trang: **"Nội dung phục vụ học tập, không phải khuyến nghị đầu tư."**

### 12.3 Điểm tổng hợp 0–100 (`scoring.py`, tính bằng code)

| Trụ cột | Trọng số mặc định | Chỉ số đầu vào (xếp hạng phần trăm trong nhóm ngành) |
|---|---|---|
| Sinh lời | 25% | ROE, ROA, biên LN ròng |
| Tăng trưởng | 20% | Tăng trưởng doanh thu, LNST, EPS |
| Hiệu quả hoạt động | 15% | Vòng quay TTS, CCC |
| Sức khỏe tài chính | 20% | Thanh khoản, nợ/vốn, khả năng trả lãi, CFO/LNST |
| Định giá | 20% | P/E, P/B so với lịch sử và ngành |

Trụ cột thiếu dữ liệu: bỏ ra và chuẩn hóa lại trọng số, hiển thị "độ phủ dữ liệu" (%). Hiển thị điểm từng trụ cột bằng radar. AI giải thích điểm, không đổi điểm.

### 12.4 Điểm mạnh/yếu: sinh theo hai bước

1. Code chọn ứng viên: chỉ số vượt/kém ngành rõ rệt (ví dụ chênh ≥ 1 độ lệch chuẩn hoặc nằm top/bottom 25% ngành), hoặc xu hướng thay đổi mạnh qua các kỳ.
2. AI viết diễn giải cho từng ứng viên, kèm `evidence`.

### 12.5 Điểm cần theo dõi (`watchlist_flags.py`)

Các cờ do code phát hiện, AI diễn giải:

| Loại | Ví dụ điều kiện |
|---|---|
| Biên lợi nhuận | Biên gộp giảm > X điểm % qua 2 quý liên tiếp |
| Hiệu quả vốn | Vòng quay hàng tồn kho/phải thu xấu đi, CCC tăng |
| Đòn bẩy/thanh khoản | Nợ/Vốn CSH tăng, hiện hành < 1 |
| Dòng tiền | CFO/LNST < 0.8 kéo dài |
| Định giá | P/E vượt band +1σ hoặc P/B trên TB 5 năm |
| Sự kiện sắp tới | Công bố BCTC, ĐHCĐ, ngày chốt cổ tức, đáo hạn trái phiếu |
| Sở hữu | Cổ đông lớn/nội bộ bán ròng, khối ngoại bán ròng kéo dài |
| Giá | Tiến sát vùng bán/vùng mua, phá MA200 |

Mỗi cờ có: `name`, `why`, `indicator`, `current_value`, `warning_threshold`, `time_window`, `severity`.

---

## 13. Tin tức & tóm tắt (G3)

### 13.1 Pipeline (`ai/news_pipeline.py`)

1. Lấy danh sách tin từ 3 nguồn (tiêu đề, thời gian, link, đoạn mô tả).
2. Khử trùng lặp (mục 8) và gom thành cụm theo sự kiện.
3. Với mỗi cụm tin quan trọng (giới hạn N mới nhất, mặc định 15 tin trong 90 ngày): lấy **nội dung bài** (nếu nguồn cho phép lấy nội dung công khai). Không lấy được nội dung thì tóm tắt từ tiêu đề + mô tả và gắn cờ `content_level = "snippet"`, UI hiện nhãn "Tóm tắt từ mô tả, chưa có toàn văn".
4. Gọi AI tóm tắt theo schema bên dưới (xử lý theo lô, có cache theo hash nội dung).
5. Nếu 3 nguồn ít tin (ví dụ < 5 tin trong 90 ngày) và grounding khả dụng: tìm bổ sung, gắn `supplementary: true`, UI hiện nhãn **"Nguồn bổ sung"**, vẫn phải tóm tắt đủ cấu trúc kèm link.

### 13.2 Chuẩn tóm tắt: đủ ý, **120–200 từ** mỗi bản tin, 5 phần

| Phần | Nội dung |
|---|---|
| Bối cảnh | Sự kiện xảy ra trong hoàn cảnh nào |
| Diễn biến chính | Điều gì đã xảy ra, bên nào liên quan |
| Số liệu quan trọng | Con số, tỷ lệ, mốc thời gian có trong tin |
| Tác động | Ảnh hưởng đến DN/ngành, chiều hướng và mức độ |
| Điểm cần theo dõi | Diễn biến kế tiếp đáng chú ý |

Kiểm tra: tổng số từ trong 5 phần nằm trong 120–200 (cho phép lệch nhẹ), thiếu phần nào thì retry. Chỉ dùng thông tin có trong bài. Thiếu số liệu thì ghi "Bài viết không nêu số liệu cụ thể".

```json
{
  "ticker": "VNM",
  "headline": "...",
  "published_at": "2026-10-12T09:30:00+07:00",
  "context": "...",
  "key_developments": "...",
  "key_figures": [{"label": "Doanh thu Q3", "value": "...", "from_text": true}],
  "impact": {"direction": "positive|neutral|negative", "level": "high|medium|low", "explanation": "..."},
  "watch_next": "...",
  "word_count": 156,
  "content_level": "full|snippet",
  "supplementary": false,
  "sources": [{"name": "vietstock", "url": "...", "type": "primary"}],
  "model_used": "gemini-2.5-flash"
}
```

### 13.3 Bản tổng hợp theo kỳ

Ngoài từng tin, có **bản tổng hợp 30 ngày** (200–300 từ) gom theo chủ đề (kết quả kinh doanh, cổ tức, M&A/đầu tư, pháp lý, nhân sự, ngành/vĩ mô), kèm biểu đồ **sentiment theo thời gian** và bảng tin (Ngày | Nguồn | Tiêu đề | Sentiment | Tác động | Mở tóm tắt).

---

## 14. Frontend: trang, layout, component

### 14.1 Trang

| Route | Trang |
|---|---|
| `/` | Tổng quan thị trường: VN-Index, VN30, HNX, tin nổi bật, ô tìm mã, mã xem gần đây, watchlist |
| `/company/[ticker]` | Hồ sơ & phân tích doanh nghiệp (trang chính) |
| `/compare?tickers=A,B,C` | So sánh 2–5 mã |
| `/watchlist` | Danh sách theo dõi (localStorage): bảng giá, P/E, P/B, ROE, điểm AI, % thay đổi |
| `/news` | Tin tổng hợp theo mã hoặc ngành |

### 14.2 Wireframe `/company/[ticker]`

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tìm mã/tên…            [Watchlist ☆] [So sánh] [Nguồn ▾] [Sáng/Tối]    │
├────────────────────────────────────────────────────────────────────────┤
│ VNM · Vinamilk · HOSE · Thực phẩm & đồ uống                           │
│ 62,500 ▲ +1.2% │ Vốn hóa │ P/E │ P/B │ ROE │ ROA │ Cổ tức │ Điểm AI  │
│ Nguồn: [Vietstock][Simplize][Yahoo]   Cập nhật 14:45 15/10/2026       │
├────────────────────────────────────────────────────────────────────────┤
│ [Tổng quan][Tài chính][Hệ số][Định giá][Cổ đông][Sự kiện][Tin][AI]    │
├──────────────────────────────────────┬─────────────────────────────────┤
│ Biểu đồ giá + dải vùng mua/bán       │ Bảng thông tin nhanh            │
│ 1M 3M 6M 1Y 5Y  [MA][RSI][Vol]      │                                 │
├──────────────────────────────────────┼─────────────────────────────────┤
│ Doanh thu/LNST + biên (bar+line)     │ Radar: DN vs trung vị ngành     │
├──────────────────────────────────────┴─────────────────────────────────┤
│ Timeline sự kiện & tin tức (lọc theo loại/nguồn)                      │
└────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Nội dung từng tab

| Tab | Bảng | Biểu đồ |
|---|---|---|
| Tổng quan | Thông tin cơ bản, ban lãnh đạo, KPI | Giá + khối lượng, doanh thu/LNST |
| Tài chính | CĐKT, KQKD, LCTT (quý/năm, YoY/QoQ, thu gọn nhóm, tô màu bất thường) | Doanh thu, LN, cơ cấu tài sản/nguồn vốn, dòng tiền |
| **Hệ số** | **Bảng hệ số mục 9.4** | **DuPont, xu hướng ROE/ROA, vòng quay, CCC** |
| Định giá | Multiple hiện tại vs lịch sử vs ngành; giá mục tiêu CTCK | Band P/E, P/B ±1σ/±2σ; football field |
| Cổ đông | Top cổ đông, sở hữu NN, giao dịch nội bộ | Donut cơ cấu, khối ngoại mua/bán ròng |
| Sự kiện | Cổ tức, ĐHCĐ, phát hành | Timeline, lịch |
| Tin tức | Bản tin tóm tắt 5 phần + bản tổng hợp 30 ngày | Sentiment theo thời gian |
| **AI** | **Mục 12.2** | **Radar, ZoneBar, giá có dải** |

### 14.4 Trang So sánh

| Thành phần | Nội dung |
|---|---|
| `CompareSelector` | Chọn 2–5 mã, gợi ý peers cùng ngành |
| `ValuationCompareTable` | P/E, P/B, P/S, EV/EBITDA, PEG, dividend yield, ROE, ROA; tô màu rẻ/đắt tương đối, cột trung vị ngành, xếp hạng |
| `RatioCompareTable` | Các hệ số mục 9 theo mã |
| `NormalizedPriceChart` | Giá chuẩn hóa về 100 |
| `RadarChart` | Đa chỉ tiêu theo trụ cột điểm |
| `PeerPercentileBar` | Vị trí phần trăm trong ngành |
| `AiCompareCard` | Nhận xét so sánh bằng AI (mục AI, kèm schema, chỉ diễn giải số đã tính) |

So sánh ngành khác nhau: hiện cảnh báo "các mã khác ngành, multiple không so sánh trực tiếp được".

### 14.5 Component hệ thống

| Nhóm | Component |
|---|---|
| Layout | `AppShell`, `TickerSearch` (autocomplete + lịch sử localStorage), `TabNav`, `ThemeToggle`, `SourceSwitcher` (Tự động/Vietstock/Simplize/Yahoo, mặc định Tự động) |
| Dữ liệu | `KpiStrip`, `DataTable` (sort, filter, sticky header, xuất CSV, heat-color), `FinancialStatementTable`, `RatioTable` |
| Biểu đồ (ECharts) | `PriceChart` (nến + MA + volume + RSI, hỗ trợ dải màu vùng mua/bán), `BarLineCombo`, `DuPontChart`, `ValuationBandChart`, `FootballFieldChart`, `RadarChart`, `Heatmap`, `OwnershipDonut`, `SentimentTimeline`, `ZoneBar` |
| Nguồn & timeline | `SourceBadge`, `FreshnessIndicator`, `DataDiscrepancyAlert` (hiện cả hai giá trị), `PartialDataBanner`, `EventTimeline` |
| AI | `AiSummaryCard`, `StrengthWeaknessTable`, `IndustryCompareTable`, `WatchPointsTable`, `NewsDigestCard`, `AiModelBadge` |
| Trạng thái | `Skeleton`, `EmptyState`, `ErrorState` (có nút thử lại), cố định `Disclaimer` |

### 14.4 Quy tắc UI

- Số: định dạng Việt Nam (dấu `.` ngăn nghìn, `,` thập phân) hoặc giữ nhất quán một kiểu; tiền hiển thị theo tỷ đồng/triệu đồng kèm đơn vị trong tiêu đề cột.
- Màu: xanh = tăng/tốt, đỏ = giảm/xấu (có thể đổi theo quy ước Việt Nam: tăng xanh, giảm đỏ, tham chiếu vàng, trần tím, sàn xanh lơ cho giá).
- Mọi bảng số liệu có hàng/ô hiển thị nguồn và kỳ. Mọi biểu đồ có chú thích nguồn.
- Khả dụng: dùng được trên mobile (bảng cuộn ngang trong container), hỗ trợ bàn phím, độ tương phản đạt chuẩn.
- Gọi API bằng TanStack Query (`staleTime` phù hợp), lazy load theo tab, hiển thị tiến trình khi chờ AI (SSE hoặc polling).

---

## 15. API (FastAPI)

Tiền tố `/api`. Tất cả trả `meta` gồm `sources_status`, `generated_at`, `cache_hit`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/search?q=` | Tìm mã/tên (autocomplete) |
| GET | `/company/{ticker}/overview` | Hồ sơ, KPI, thông tin nhanh |
| GET | `/company/{ticker}/prices?range=1y&interval=1d` | OHLCV |
| GET | `/company/{ticker}/financials?period=quarter\|year&statement=is\|bs\|cf` | BCTC nhiều kỳ |
| GET | `/company/{ticker}/ratios?period=quarter\|year` | Hệ số (mục 9), kèm TB ngành |
| GET | `/company/{ticker}/valuation` | Multiple, band, giá mục tiêu CTCK, football field |
| GET | `/company/{ticker}/ownership` | Cổ đông, khối ngoại, nội bộ |
| GET | `/company/{ticker}/events` | Cổ tức, ĐHCĐ, phát hành, lịch |
| GET | `/company/{ticker}/news?days=90` | Tin đã tóm tắt 5 phần + tổng hợp 30 ngày |
| GET | `/company/{ticker}/analysis` | Phân tích AI (mục 12). Hỗ trợ `Accept: text/event-stream` |
| GET | `/company/{ticker}/zones` | Vùng mua/bán |
| GET | `/industry/{ticker}` | Peers và trung vị ngành |
| GET | `/compare?tickers=A,B,C` | Dữ liệu so sánh + nhận xét AI |
| GET | `/market/overview` | Chỉ số thị trường, tin nổi bật |
| GET | `/health` | Liveness (Cloud Run) |
| GET | `/sources/status` | Tình trạng từng connector (để debug/demo) |

Tham số chung: `?source=auto|vietstock|simplize|yahoo` (mặc định `auto`).
Mã lỗi: `404` mã không tồn tại, `422` tham số sai, `429` vượt rate limit, `503` mọi nguồn lỗi. Thân lỗi dạng `{ "error": { "code", "message", "hint" } }`.

---

## 16. Cache, hiệu năng, giới hạn

| Dữ liệu | TTL gợi ý |
|---|---|
| Giá hiện tại | 60–120 giây |
| OHLCV lịch sử | 15–30 phút (cuối ngày có thể dài hơn) |
| BCTC, hồ sơ, cổ đông | 6–24 giờ |
| Peers, trung vị ngành | 6 giờ |
| Tin tức (danh sách) | 10–15 phút |
| Tóm tắt AI | Theo hash nội dung, 6–24 giờ |

- `core/cache.py`: `TTLCache` + **single-flight** (nhiều request cùng khóa chỉ gọi nguồn 1 lần).
- Timeout từng nguồn 8–10 giây; AI 60 giây. Request tổng tối đa 120 giây (SSE).
- Rate limit phía API theo IP (ví dụ 60 request/phút) để tránh bị lợi dụng và tiết kiệm quota Gemini.
- Cloud Run `api`: concurrency 20–40, memory 512Mi–1Gi, **max-instances nhỏ (2–3)** để hạn chế số IP/lượng request gọi ra nguồn, min-instances 0 (đặt 1 khi demo để tránh cold start).
- Cache nằm theo từng instance, không chia sẻ. Không dựa vào cache cho tính đúng đắn.

---

## 17. Triển khai Cloud Run

| Hạng mục | Quy định |
|---|---|
| Dockerfile `api` | `python:3.12-slim`, cài bằng `uv`/`pip`, chạy `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Dockerfile `web` | Multi-stage build Next.js với `output: 'standalone'`, chạy `node server.js`, đọc `PORT` |
| Biến môi trường | `api`: `GEMINI_API_KEY` (Secret Manager), `GEMINI_MODEL_CHAIN`, `ALLOWED_ORIGINS`. `web`: `NEXT_PUBLIC_API_BASE_URL` |
| Secret | Dùng Secret Manager, **không commit key**, `.env` nằm trong `.gitignore` |
| Log | JSON có cấu trúc ra stdout (Cloud Logging): `source`, `ticker`, `latency_ms`, `status`, `model_used` |
| Health | `/health` trả 200, không gọi nguồn ngoài |
| Lệnh deploy | Ghi trong `README.md` (`gcloud run deploy ... --source` hoặc build bằng Artifact Registry) |

Rủi ro đặc thù: IP của Cloud Run là IP dùng chung của Google, một số trang có thể chặn hoặc giới hạn. Nếu một nguồn chặn khi chạy trên cloud nhưng chạy local được, ghi vào `decisions.md`, bật cờ tắt connector đó, dùng nguồn còn lại và hiển thị `PartialDataBanner`. Không cố vượt cơ chế chống bot.

---

## 18. Quy tắc code

**Backend (Python)**

- Python 3.12, kiểu đầy đủ (type hints), Pydantic v2 cho mọi schema vào/ra, `ruff` + `mypy`.
- Toàn bộ I/O là `async`; dùng một `httpx.AsyncClient` dùng chung, đặt timeout rõ ràng.
- Connector chỉ **lấy và trả dữ liệu thô đã parse**. Chuẩn hóa nằm ở `fusion/`, tính toán ở `analytics/`, AI ở `ai/`. Không trộn lẫn tầng.
- Connector có interface chung (`fetch_profile`, `fetch_prices`, `fetch_financials`, `fetch_news`, …) và **trả lỗi có phân loại** (`SourceTimeout`, `SourceBlocked`, `SourceParseError`, `NotFound`).
- Không `except Exception: pass`. Mọi lỗi nguồn được log kèm `source` và `ticker`.
- Dùng `Decimal` hoặc `float` nhất quán cho tính toán; làm tròn chỉ ở tầng hiển thị.
- Không hard-code endpoint/ngưỡng trong logic; đặt ở `config.py` hoặc `docs/data-mapping.md` tương ứng.

**Frontend (TypeScript)**

- `strict: true`. Kiểu TS khớp schema API (có thể sinh từ OpenAPI của FastAPI).
- Component thuần hiển thị nhận props đã chuẩn hóa; logic fetch nằm trong hooks.
- Không đặt key/secret trong code client. Chỉ `NEXT_PUBLIC_API_BASE_URL`.
- Mọi component dữ liệu xử lý đủ 4 trạng thái: loading, empty, partial, error.

**Chung**

- Commit nhỏ, thông điệp rõ. Mỗi phase kết thúc có README cập nhật.
- Comment giải thích *vì sao*, đặc biệt ở công thức và các giả định.

---

## 19. Kiểm thử

| Loại | Nội dung |
|---|---|
| Unit | Công thức hệ số (dùng số liệu mẫu tính tay, đối chiếu), vùng mua/bán, điểm số, khử trùng lặp tin, ngưỡng đối chiếu |
| Connector | Test bằng **fixture** (response đã lưu), không gọi mạng thật trong CI. Có script thủ công `scripts/smoke_sources.py` để kiểm tra endpoint còn sống |
| AI | Test `guard.py` và validate schema bằng đầu ra mẫu; test chuỗi fallback bằng mock lỗi 429/timeout/JSON sai |
| Tích hợp | Một số mã mẫu: `VNM` (tiêu dùng), `FPT` (công nghệ), `VCB` (ngân hàng), `HPG` (thép), `SSI` (chứng khoán), `VHM` (bất động sản) |
| Giao diện | Kiểm tra thủ công 4 trạng thái; kiểm tra mobile; Lighthouse cơ bản |

Mã thử bắt buộc phải qua: một ngân hàng, một chứng khoán, một doanh nghiệp sản xuất, một mã UPCoM thanh khoản thấp (để kiểm tra dữ liệu thiếu).

---

## 20. Lộ trình & checklist theo phase

### Phase 0: Khảo sát nguồn và chốt schema
- [ ] Khảo sát endpoint cho từng loại dữ liệu ở mục 6.2 trên cả 3 nguồn, ghi vào `docs/data-mapping.md`
- [ ] Ghi rõ endpoint nào cần cookie/token/key/trả phí; nêu phương án miễn phí
- [ ] Chốt schema chuẩn hóa và bảng ánh xạ trường, ghi `docs/formulas.md`
- [ ] Xác nhận model Gemini free và hạn mức hiện hành, chốt `GEMINI_MODEL_CHAIN`
- [ ] Lưu fixture response cho các mã mẫu

### Phase 1: Khung và trang Tổng quan
- [ ] Dựng `api` + `web`, Docker hóa, chạy `docker-compose` local
- [ ] Connector Vietstock + Yahoo (hồ sơ, giá), `TickerSearch`, trang `/company/[ticker]` tab Tổng quan, `PriceChart`
- [ ] **Deploy thử lên Cloud Run** (kiểm tra sớm vấn đề IP/chặn)

### Phase 2: Data Fusion + Tài chính
- [ ] Connector Simplize, `fusion/*`, provenance, `DataDiscrepancyAlert`, `PartialDataBanner`
- [ ] Tab Tài chính (CĐKT, KQKD, LCTT, quý/năm, YoY/QoQ)

### Phase 3: Hệ số + Định giá (đáp ứng G1)
- [ ] `analytics/ratios.py` đủ nhóm mục 9.2; xử lý ngành đặc thù mục 9.3
- [ ] Tab Hệ số (ROE, ROA, vòng quay, P/E, P/B, DuPont, CCC), đối chiếu với số các nguồn
- [ ] Tab Định giá: band P/E, P/B, giá mục tiêu CTCK, football field

### Phase 4: So sánh + trung bình ngành (đáp ứng G2c)
- [ ] `analytics/industry.py` (peers, trung vị), radar, `PeerPercentileBar`
- [ ] Trang `/compare` đầy đủ

### Phase 5: Tin tức + tóm tắt AI (đáp ứng G3)
- [ ] `ai/client.py` + fallback Gemini, `guard.py`, schema
- [ ] Pipeline tin, khử trùng lặp, tóm tắt 5 phần 120–200 từ, tổng hợp 30 ngày, sentiment
- [ ] Nhãn "Nguồn bổ sung" nếu grounding khả dụng

### Phase 6: Phân tích AI (đáp ứng G2a, G2b, G2d)
- [ ] `zones.py`, `scoring.py`, `watchlist_flags.py`
- [ ] Tab AI: tóm tắt, mạnh/yếu, so ngành, vùng mua/bán, điểm cần theo dõi, rủi ro, điểm tổng hợp
- [ ] Cổ đông + Sự kiện + Timeline hợp nhất

### Phase 7: Hoàn thiện
- [ ] Watchlist (localStorage), xuất CSV, `/news`, `/` tổng quan thị trường
- [ ] Tối ưu hiệu năng, kiểm thử mục 19, README, tài liệu báo cáo đồ án
- [ ] Deploy bản cuối, kiểm tra theo bảng nghiệm thu mục 21

---

## 21. Bảng nghiệm thu cuối (Definition of Done)

| # | Tiêu chí | Đạt |
|---|---|---|
| 1 | Tìm mã, mở trang DN, dữ liệu từ ≥ 2 nguồn được hợp nhất, mỗi số có nguồn + thời điểm | ☐ |
| 2 | Tab Hệ số có ROE, ROA, 5 vòng quay, CCC, P/E, P/B, DuPont, cột TB ngành | ☐ |
| 3 | Số tự tính đối chiếu với số nguồn; lệch thì cảnh báo | ☐ |
| 4 | Tab AI có điểm mạnh, điểm yếu, so TB ngành, vùng mua/bán, điểm cần theo dõi | ☐ |
| 5 | Vùng mua/bán do code tính, có độ tin cậy và giả định hiển thị | ☐ |
| 6 | Mỗi bản tin tóm tắt 5 phần, 120–200 từ, có nguồn/link | ☐ |
| 7 | Fallback Gemini hoạt động (kiểm chứng bằng cách giả lập lỗi model #1) | ☐ |
| 8 | Một nguồn lỗi không làm sập trang (`PartialDataBanner`) | ☐ |
| 9 | Ngân hàng/chứng khoán hiển thị đúng bộ chỉ số, không có số 0 sai | ☐ |
| 10 | So sánh 2–5 mã với bảng định giá, giá chuẩn hóa, radar | ☐ |
| 11 | Không dùng DB; watchlist lưu `localStorage` | ☐ |
| 12 | Chạy được trên Cloud Run, secret trong Secret Manager | ☐ |
| 13 | Có disclaimer "học tập, không phải khuyến nghị đầu tư" | ☐ |
| 14 | `docs/data-mapping.md`, `docs/formulas.md`, `docs/decisions.md` đầy đủ | ☐ |

---

## 22. Báo cáo khi hoàn thành mỗi phase

Agent báo cáo ngắn gọn gồm: (1) đã làm gì, (2) kiểm tra thế nào, (3) **vấn đề gặp phải** (nguồn bị chặn, cần trả phí, thiếu dữ liệu…), (4) **các điểm `TODO(verify)` còn lại**, (5) đề xuất bước tiếp theo. Nếu cần quyết định của người dùng (ví dụ phải dùng dịch vụ trả phí, nguồn thay đổi cấu trúc) thì **dừng và hỏi**, không tự ý chọn.
