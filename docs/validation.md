# Kiểm thử FinScope — 15/10/2026

## Kiểm tra tự động cuối

| Kiểm tra | Kết quả |
|---|---|
| Python pytest | **57 passed**, 1 cảnh báo deprecation từ Starlette TestClient/httpx, không phải lỗi test |
| Ruff `app tests` | All checks passed |
| mypy `app` | Không lỗi trong 23 source files |
| TypeScript strict | `tsc --noEmit` qua |
| Next.js production build | Qua, Next.js 15.5.28; standalone, 5 route chính + trang 404 |
| Compose syntax | `docker compose config --quiet` qua |
| Kiểm tra key | Không tìm thấy giá trị key từ `.env` trong source ứng dụng, docs, scripts |

Test gồm công thức tính tay (ROE/ROA/5 vòng quay/CCC/DuPont/dòng tiền/định giá), thiếu mẫu số/TTM, ngành tài chính, EPS và thay đổi số CP, vùng giá, thống kê peers, điểm, nguồn blocked/không tồn tại, single-flight, fixture ba nguồn, guard số/từ ngữ/evidence, định dạng số Việt-Anh, tin trùng/số từ và mock fallback Gemini 429/5xx/timeout/schema sai. Test không dùng dữ liệu mạng hoặc API key thật.

## Live nguồn: 7 mã

| Mã | Sàn / nhóm | Simplize | Vietstock | Yahoo | Quan sát |
|---|---|---|---|---|---|
| VNM | HOSE / sản xuất | Có | Có | Có | BCTC, LCTT, vùng giá, phân tích, cổ đông/tin/sự kiện |
| FPT | HOSE / doanh nghiệp | Có | Có | Có | So sánh cùng VNM, cảnh báo khác ngành |
| VCB | HOSE / ngân hàng | Có | Có | Có | ROE/ROA; vòng quay tồn kho null/N/A |
| HPG | HOSE / sản xuất | Có | Có | Có | Hệ số vòng quay và CFO |
| SSI | HOSE / chứng khoán | Có | Có | Có | Bộ chỉ tiêu tài chính, chỉ tiêu sản xuất N/A |
| VHM | HOSE / bất động sản | Có | Có | Có | Hệ số và dữ liệu nhiều kỳ |
| VEF | UPCoM | Có | Có | Không có | Phần còn lại vẫn hoạt động; không tạo chuỗi giá thay thế |

Kết quả chính: **7/7 mã** có dữ liệu từ Simplize và Vietstock; Yahoo có dữ liệu cho **6/7 mã**. Không suy ra độ phủ mọi cổ phiếu từ mẫu này. Snapshot và fixture ở `artifacts/live-sources.json`, `api/tests/fixtures/`; runtime không đọc các file đó.

## Live API và AI

- Health, search, overview, BCTC, ratios VCB, valuation, ownership, events, news và compare đã trả 200 với dữ liệu thật.
- Báo cáo năm công khai 3 kỳ 2025/2024/2023 đã trả dữ liệu; không yêu cầu lịch sử membership 5 năm.
- Mã thử không tồn tại `ZZZZZZ` trả **404** có lỗi JSON; tham số không hợp lệ trả 422. Mock kiểm tra mọi nguồn bị chặn và chịu lỗi từng phần.
- Key đầu tiên không hợp lệ; sau khi người dùng cung cấp key mới, Gemini `gemini-2.5-flash` đã phân tích thành công. Bản kiểm tra cuối của phân tích và so sánh AI đều được chấp nhận sau khi guard phát hiện lỗi ở lượt trước và retry.
- Một tin đã qua schema **5 phần, 120–200 từ**, quan sát model fallback `gemini-2.5-flash-lite` thành công. Tin mô tả quá ngắn bị từ chối mở rộng.
- Tổng hợp 30 ngày đã qua schema với **257 từ**, model `gemini-2.5-flash`; lỗi đọc số nguồn dạng `1.863,41` phát hiện trong live test đã được sửa và bổ sung test hồi quy.
- Lượt lỗi AI/guard được giữ riêng trong trạng thái; không biến output bị loại thành nhận định hiển thị. Việc model thành công trong vài lượt không đảm bảo mọi tin/đầu vào sẽ qua; hết quota/schema/guard thì trả trạng thái rõ ràng.

`artifacts/final-analysis.json`, `final-compare-ai.json`, `final-monthly.json`, `live-news-summary.json` giữ kết quả quan sát. Guard kiểm tra số/nguồn/cấm khẳng định tuyệt đối; không thay thế kiểm chứng ngữ nghĩa từng nhận định.

## Kiểm tra giao diện thực tế

- Mở bản production localhost trong trình duyệt; trang tổng quan và trang VNM tải dữ liệu thật.
- Tab Hệ số: ROE, ROA, 5 vòng quay, CCC, P/E, P/B, cột ngành và cảnh báo chênh nguồn xuất hiện; bảng không điền 0 vào ô thiếu.
- Bấm Theo dõi → trạng thái Đang theo dõi; sau reload nút vẫn được tìm thấy. Đã xóa lại mã thử để trả watchlist về trạng thái trước kiểm tra.
- Chuyển sáng/tối; kiểm tra viewport **390×844**, layout DOM rộng 375px, không tràn ngang toàn trang, sidebar ẩn ngoài màn hình và nút menu hiện. Bảng/tab cuộn trong vùng riêng. Đã reset viewport và trả về theme sáng sau test.
- Ảnh desktop và mobile đã được xem trực tiếp; đã sửa selector SVG trang hero vốn ảnh hưởng icon bên trong.
- Bấm **Xuất CSV** trong bảng Hệ số, trình duyệt tải được `FinScope-he-so.csv`; đọc lại có **42 dòng gồm header, 9 cột**, UTF-8 tiếng Việt, kỳ/đơn vị/nguồn đầy đủ.
- Console của tab tổng quan tại lần kiểm tra cuối không có error trong các log được tool trả về.

## Chưa xác minh và tiêu chí còn thiếu

**Không đánh dấu toàn bộ Definition of Done đã đạt.** Đã dựng luồng local chính và các tính năng có dữ liệu, nhưng còn giới hạn cụ thể trong `docs/decisions.md`: toàn văn/link từng bài gốc, nhiều nguồn cho tin; phạm vi/audit Simplize; weighted-share EPS độc lập; lịch sử đủ sâu/PEG; tái dựng adjusted band; một số chuỗi nâng cao về giao dịch, ban lãnh đạo và sự kiện tương lai.

Docker engine chưa chạy nên mới xác minh cú pháp compose, **chưa build/run image**. Chưa chạy Lighthouse, remote CI hoặc Cloud Run. Không có bằng chứng về CORS, IP nguồn hay secret hoạt động trên cloud; người dùng tự triển khai theo README rồi cần kiểm tra tại môi trường đó. Các nguồn công khai có thể đổi cấu trúc, độ mới hoặc giới hạn sau ngày kiểm tra.

Ghi chú bàn giao: tab người dùng được tải lại sau khi restart API và đã hiển thị lại chỉ số/bảng giá thật. Có log RSC prefetch fallback trong lượt nạp lại; kiểm tra HTTP riêng của route VCB và RSC đều trả 200. Đây chưa phải bằng chứng một phiên browser dài hạn hoàn toàn không có lỗi mạng thoáng qua.


## Cập nhật trải nghiệm tin tức và so sánh — 15/10/2026
- Tin dùng thumbUrl/imageUrl của JSON nguồn; mô tả được làm sạch HTML và biểu mẫu báo lỗi. Ảnh đang tải/lỗi có biểu tượng dự phòng, không tạo ảnh giả sự kiện.
- Sự kiện hiển thị trích yếu nguồn và các ngày GDKHQ/đăng ký/thực hiện khi được cung cấp; công bố chỉ có tiêu đề được ghi rõ giới hạn.
- Gemini tổng hợp tháng trả về sections/title/bullets, kiểm tra tổng 200–300 từ; prompt monthly-v2.
- So sánh có bộ mã phổ biến, giá nguồn, trung vị giá mục tiêu CTCK, ngày/quan điểm/link báo cáo; chỉ lấy báo cáo mới nhất mỗi CTCK, ưu tiên 90 ngày khi đủ hai nguồn, tối đa 180 ngày. Một nguồn được ghi rõ; thiếu báo cáo để trống. Giá mục tiêu là trường dữ liệu Simplize, chưa kiểm toán từng PDF hay điều chỉnh cổ phiếu.
- Màu và ký hiệu hệ số dựa trên đánh giá so với mẫu ngành của từng mã, không xếp hạng trực tiếp các ngành khác nhau.
- Biểu đồ có chọn chỉ tiêu ở bảng tài chính, hệ số và so sánh; giữ null thay vì biến dữ liệu thiếu thành 0.
- Live API: VNM 15/15 tin có URL ảnh, 29 sự kiện có trích yếu; VNM/FPT mỗi mã có ba CTCK. Gemini key mới tạo được năm mục tổng hợp tháng.
- Live UI: đổi P/E ở so sánh, LNST ở tài chính và P/B ở hệ số; tab chọn nền teal chữ trắng. Mobile 390px: document scrollWidth = clientWidth = 375px. URL ảnh tồn tại không đồng nghĩa mọi ảnh đã tải được trong trình duyệt.

- Kiểm thử cuối: 62/62 pytest đạt; Ruff sạch; mypy 24 file sạch; Next.js production build và TypeScript đạt. HEAD ảnh tin đầu tiên trả 200 image/png; trình duyệt có placeholder khi ảnh chưa tải.

- Vòng kiểm tra cuối: ảnh tin đầu và tin tiếp theo đã hiển thị thực tế trong IAB; trích yếu không còn biểu mẫu báo lỗi. Gemini sau làm sạch trả sáu mục. So sánh mobile cũng không tràn ngang (375/375px).


## Sửa lỗi và mở rộng phân tích — 15/10/2026
- Chuỗi model: Gemini 3.8 Flash → 3.6 Flash → 3.5 Flash-Lite → 2.5 Flash → 2.5 Flash-Lite. Đã live listModels và generateContent với key hiện tại. Cấu hình theo bảng giá free tier được kiểm tra tại https://ai.google.dev/gemini-api/docs/pricing, không gọi Pro chỉ có paid tier. Lỗi quota chuyển ngay sang model kế tiếp; timeout một model không thử lại cùng model. Cache có model chain và schema, giới hạn đồng thời dùng chung toàn ứng dụng.
- FOX: Yahoo không có dữ liệu; fallback endpoint Simplize /api/historical/prices/chart?ticker=FOX&period=1y, đối chiếu từ bundle chart công khai. Tuple timestamp/open/high/low/close/volume, giá VND. Live 249 phiên; đã nhìn thấy đường giá và khối lượng trong trình duyệt. 6 tháng lọc từ chuỗi một năm, không tạo OHLC giả.
- Tin: endpoint /api/company/news-event/detail/{id} cung cấp nội dung bài, ảnh và sourceUrl bài gốc. Chia từng nhóm ba tin để AI không bỏ sót bài trong danh sách dài. Kiểm tra đủ id, evidence của đúng bài; ánh xạ nguồn bằng code và không sửa object trong cache model. Live 15/15 tin có summary/impact/watch_next, model 3.8 Flash.
- Sự kiện: đọc PDF thật qua pypdf; PDF scan được gửi trực tiếp dạng inline PDF cho Gemini, ghi rõ giới hạn đọc ảnh. Không tải URL tùy ý: chỉ CDN công bố được xác minh. Render trang đầu thành PNG bằng PDFium; cache tối đa 32 ảnh, một worker render, giới hạn PDF 8MB. Live preview 200 image/png; sáu sự kiện đã được đánh giá, fallback model hoạt động khi gặp 503.
- Phân tích sâu: AI chọn focus từ sáu nhóm công cụ; code truy vấn thêm báo cáo năm, dòng tiền, tin chi tiết, sở hữu và tính log-return volatility × sqrt(252), max drawdown, thay đổi cùng kỳ, độ nhạy P/E/P/B ±20%. AI chỉ diễn giải dữ kiện, không chạy mã tùy ý. Live hoàn thành bằng Gemini 3.8 Flash; không phải một dịch vụ nghiên cứu web không giới hạn.
- UI: bảng tài chính sort tăng/giảm theo tên và từng kỳ, null cuối bảng, tùy chọn trở về thứ tự báo cáo. Cổ đông gom theo loại/quốc gia/tên; bar quốc gia/tên dùng % vốn nguồn, không chuẩn hóa mẫu thành 100%; chỉ vẽ chín nhóm lớn + phần còn lại để màu không lặp. Nhãn số làm tròn tránh float dài tràn hộp.
- Tin và sự kiện tách tab rõ, ngày không có giờ, ảnh căn trên cùng. Màu nút AI nền teal chữ trắng; sidebar bỏ promo; nút bỏ theo dõi đổi X. Tăng kích thước chữ đọc dữ liệu, ngắt dòng và giới hạn khối cuộn trong từng bảng.
- Kiểm thử: 71/71 pytest đạt, Ruff sạch, mypy 28 file sạch; TypeScript đã đạt sau sửa formatter biểu đồ. Có một cảnh báo deprecation Starlette/httpx như trước.
- Giới hạn: 429/503 từ nhà cung cấp vẫn có thể xảy ra; giao diện có trạng thái tải/lỗi và thử lại. Chỉ báo giá, mục tiêu CTCK và dữ liệu cổ đông vẫn phụ thuộc kỳ và chất lượng nguồn. PDF scan do AI đọc chưa được người dùng kiểm toán từng tài liệu.

- Xác nhận bản cuối: 72/72 tests đạt, Ruff/mypy sạch, production build đạt. Test mới bao phủ thời gian chờ hàng đợi không tiêu hao budget sinh nội dung. Lỗi 503 fallback ngay; negative cache không gia hạn lại mỗi lần đọc.
- Live lặp lại sau sửa cache: 15/15 tin và 6/6 sự kiện đủ kết quả; đọc lại 15 tin từ cache trả ngay và vẫn giữ đầy đủ evidence/nguồn.
- UI thực tế: FOX vẽ đường giá và volume; sort Q2/2026 đổi giảm/tăng; gom quốc gia/tên có nhãn % làm tròn; so sánh 5 mã có đủ 5 thẻ, không khối chữ vượt thẻ, document 1265/1265px. Nút AI có nền rgb(13,139,121), chữ trắng.
- Mobile 390px: cổ đông và trang tin document 375/375px; bài tin có tóm tắt AI, ảnh hưởng, điểm theo dõi, ngày không giờ và link bài gốc Fili/Tin nhanh chứng khoán được kiểm tra trong DOM.


### Icon thay đổi trong bảng công ty
- Bảng hệ số: thêm icon tăng/giảm/không đổi cạnh giá trị hiện tại so với kỳ trước; thiếu dữ liệu đối chiếu không vẽ icon.
- BCTC: mỗi ô so với kỳ trước; khi chọn thay đổi cùng kỳ thì icon đổi sang cùng kỳ. Có cả bảng Vietstock đối chiếu.
- Icon xanh dương/cam chỉ chiều biến động, tách với màu đánh giá tốt/kém; tooltip và nhãn accessibility nêu hai số đối chiếu. Không cần gọi AI hoặc thay phép tính.
- Kiểm tra UI: VNM BCTC hiện 262 icon có nhãn đối chiếu; chuyển YoY đổi nhãn sang cùng kỳ. Bảng hệ số có 29 icon với dữ liệu hợp lệ. TypeScript và production build đạt.


## Tiếng Việt, dòng tin hợp nhất và mở rộng góc nhìn CTCK
- So sánh: prompt compare-v2-vi yêu cầu diễn giải tiếng Việt có dấu, guard từ chối câu thuần tiếng Anh/không dấu và thử lại. API cấp evidence_labels tiếng Việt để UI không hiện các tên biến profit_growth/npl/cir. Facts có ngành/kỳ, prompt ngân hàng không dùng FCF/vốn lưu động theo logic doanh nghiệp sản xuất.
- NewsPanel dùng chung ở trang tin và doanh nghiệp: bỏ bảng Điểm tin nhanh trùng lặp, giữ một thẻ cho mỗi bài, đổi nút thành “AI phân tích”. EventsPanel cũng dùng CompanyOutlook chung.
- Toàn cảnh nhanh: chỉ nhận xét chiều hướng, sự kiện có thể đổi chiều và điểm cần xác nhận; tối đa ba phần, nội dung ngắn. Giữ ticker trong facts, không gán tin doanh nghiệp khác cho mã đang xem. Mã bằng chứng ngắn được code ánh xạ lại URL gốc, không sửa cache model. Nội dung nguồn được giới hạn theo mục đích tổng hợp, phần từng bài vẫn độc lập.
- CTCK: lấy thêm API công khai /api/company/analysis-report/list với page/size=20, ghép trang tóm tắt, loại PDF trùng, giữ cả nhận định không có target và báo cáo lịch sử. UI lọc CTCK, thời gian, mới nhất mỗi CTCK và tải trang tiếp. Mặc định không trộn lịch sử vào giá hiện tại: vùng giá chỉ lấy báo cáo mới nhất mỗi CTCK trong tối đa 180 ngày.
- Live: lượt đầu VNM 23 báo cáo / 15 CTCK; trang hai thêm 20 báo cáo, UI mở rộng lên 17 CTCK. Bộ lọc 180 ngày trả ba góc nhìn gần đây. So sánh VCB/TCB/MBB/ACB trả tiếng Việt bằng Gemini 3.5 Flash-Lite. Có 429/503 từ các model cao, fallback được kiểm tra.
- Đã tăng cỡ chữ nền 15px, nội dung AI 15px, dữ liệu bảng 14px, nhãn nguồn/dẫn chứng 12–13px; giữ cấp bậc tiêu đề. DOM xác nhận 15 thẻ bài, không còn bảng Điểm tin nhanh, nút AI phân tích; mobile 390px document 375/375px.
- Kiểm thử: 78/78 pytest đạt, Ruff/mypy 29 file sạch; TypeScript và Next.js production build đạt. Có một deprecation warning Starlette/httpx như trước. Kiểm tra tiếng Việt là heuristic chặn đầu ra thuần tiếng Anh, không phải bộ nhận diện ngôn ngữ tuyệt đối.

- Xác nhận cuối: monthly-v5-outlook chạy live thành công (16 giây), chia ba mục có bằng chứng URL thật; UI tải lại hiển thị đúng kết quả. Desktop document 1265/1265px, 15 thẻ tin, body 15px. Đã reset viewport sau kiểm tra mobile. Bản trả lời và log live nằm trong artifacts/outlook-final.json; không coi mọi suy luận AI là dữ kiện đã kiểm toán thủ công.

## Docker / Cloud Build — sửa lỗi thiếu Dockerfile ở gốc
- Nguyên nhân log người dùng: context /workspace là gốc repository nhưng Dockerfile trước đây chỉ có tại api/ và web/. Không phải lỗi cổng hay lỗi Gemini.
- Thêm Dockerfile gốc: build mặc định API, target api và web rõ ràng; cloudbuild.api.yaml / cloudbuild.web.yaml build → push → deploy hai service. Web bắt buộc API URL HTTPS kết thúc /api từ build args, không đóng localhost vào bundle cloud. Root .dockerignore loại .env, node_modules và artifact. Dockerfile API riêng copy source trước pip install.
- Đã khởi động Docker Desktop và build Linux image thật: docker build -t finscope-api:cloud-check . đạt; target web với API URL kiểm tra HTTPS đạt, Next.js compile/typecheck/static generation đạt. Lần kéo Node base image đầu gặp timeout TLS Docker Hub, chạy lại thành công.
- API container PORT=9090, host 127.0.0.1:18081: /health và /api/health 200; VNM overview 200, cả Simplize/Vietstock/Yahoo báo ok. Chạy UID 10001; PDFium/Pillow import được, đủ 7 prompt; /app/.env không tồn tại.
- Web container PORT=9091, host 127.0.0.1:18082: /, /company/VNM, /compare?tickers=VCB,TCB,MBB,ACB đều 200. 13 script asset trả thành công; browser bundle chứa đúng API URL build-time kiểm tra. Chạy UID 1000. URL dùng kiểm tra là api-validation.example, không phải API cloud thật; chưa có kiểm thử end-to-end hai service cloud.
- Parse hai YAML thành công; kiểm tra target/context/build-push-deploy và docker compose config --quiet đạt. Đã dừng hai container kiểm thử, giữ nguyên các server local sản phẩm.
- Chưa push GitHub, chưa chạy Cloud Build, chưa deploy Cloud Run hoặc kiểm tra IAM/secret/CORS cloud. README có trình tự API → web → ALLOWED_ORIGINS, substitutions và quyền trigger cần thiết. Các ghi chú Docker chưa xác minh ở phần cũ của tài liệu được thay thế bằng kết quả local trong mục này.

## Sửa build legacy từ log 281a45f6 — 15/10/2026
- Log cloud commit b220f53 chạy toàn bộ stage trước stage cuối, lỗi ERR_INVALID_URL input rỗng trong web-builder dù mục tiêu mặc định là API. Kiểm thử trước bằng BuildKit không phát hiện vì BuildKit bỏ qua stage không liên quan.
- Tách Dockerfile gốc chỉ còn 9 chỉ dẫn Python API; chuyển frontend sang Dockerfile.web với context gốc. cloudbuild.web.yaml đổi đường dẫn tương ứng. Không yêu cầu NEXT_PUBLIC_API_BASE_URL khi build API; web vẫn kiểm tra HTTPS /api và nay báo rõ thiếu build arg thay vì TypeError chung chung.
- Đã build thật bằng DOCKER_BUILDKIT=0 docker build -t finscope-api:legacy-check .: đủ 9 bước, thành công, không có Node/npm. Container PORT=9090 trả /health 200, đã dừng container sau kiểm tra.
- Hai cấu hình YAML trỏ đúng Dockerfile tương ứng, context gốc; git diff --check đạt. README cập nhật hướng dẫn trigger và yêu cầu chạy commit mới, retry commit cũ không nhận bản sửa.
- Không push GitHub/deploy Cloud Run trong lượt sửa này. Kết quả legacy local bổ sung cho kiểm thử BuildKit ở mục trước.
- Dockerfile.web độc lập cũng build thành công thành finscope-web:split-check bằng BuildKit với URL HTTPS kiểm tra; Next.js compile, typecheck, static generation và đóng image đều đạt.

## Một service finscope — 15/10/2026
- Người dùng chọn gộp frontend/backend trong một service; thay thế yêu cầu hai service cũ. Dockerfile gốc build Next.js và Python vào một image Debian Bookworm. Next chạy trên PORT, rewrite /api/* và /health tới FastAPI nội bộ 127.0.0.1:8001. API base compile là /api, không yêu cầu domain backend/CORS riêng.
- cloudbuild.yaml mới build/push/deploy service finscope tại asia-southeast3, memory 1Gi, timeout 120s. Các config tách riêng chỉ giữ làm lựa chọn cũ; README yêu cầu tắt trigger cũ để tránh ghi đè service.
- Launcher chờ API health trước khi mở web, giữ secret Gemini riêng ở môi trường Python, dừng các child khi SIGTERM hoặc một child thoát. Proxy timeout 120000ms thay mặc định 30000ms.
- TypeScript typecheck và Ruff launcher đạt; AST Python/YAML cấu hình đạt; kiểm tra config transpile xác nhận rewrite /api và /health, timeout và mode local tách riêng. Hai tình huống launcher giả lập đạt: SIGTERM thoát 0, child lỗi thoát 1 và dừng sibling; PORT được truyền đúng, key không truyền cho Node.
- CHƯA xác minh build/run image gộp thành công: build Docker đầu ngắt EOF; engine sau đó không khởi động, trả DockerDesktop/Wsl/ExecError, provisioning block device /dev/sdd / mkfs exit status 1. Đã thử mở lại/restart theo yêu cầu người dùng; không reset/xóa volume/data. Build legacy tiếp theo không vào được daemon. Đây là giới hạn môi trường Docker, không được coi là kiểm thử container đạt.
- Chưa push GitHub, deploy cloud hoặc thay đổi các service cloud. Server sản phẩm local ngoài Docker không bị dừng.
