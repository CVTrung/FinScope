# Quyết định, tiến độ và giới hạn

## Quyết định

1. **Không database**, theo mục 2/21 của `agent.md`. Người dùng cho phép truy cập PostgreSQL nhưng không yêu cầu bắt buộc lưu DB. Không sửa PostgreSQL hoặc hệ thống dữ liệu có sẵn. Cache instance + localStorage cho watchlist/recent/theme.
2. Local hoàn thiện trước, không deploy Cloud Run theo yêu cầu trực tiếp. Hai Dockerfile/compose và hướng dẫn được chuẩn bị; Docker Desktop engine chưa chạy tại lúc kiểm tra nên chưa tuyên bố container/Cloud Run đã qua live test.
3. Nguồn công khai miễn phí; không đăng nhập, không lấy membership token, không vượt chặn. Giới hạn Simplize: 12 quý / 3 năm; lịch sử sâu hơn trả 401 thì giữ thiếu.
4. Giá Vietstock được ưu tiên vì thời điểm trên hồ sơ Simplize có thể cũ; không lấy `analysisUpdated` thay ngày giá. Đối chiếu chênh chỉ khi có ngày/kỳ phù hợp.
5. LCTT lấy endpoint riêng rồi ghép bằng `periodDate`; `/fi/ratio/` không chứa cash flow. Thiếu một nhóm chỉ tiêu không làm rơi toàn trang.
6. Ngân hàng/chứng khoán/bảo hiểm có chỉ tiêu N/A, không điền 0. Phạm vi/kiểm toán chưa xác minh của Simplize giữ nhãn chưa xác định.
7. EPS yêu cầu CP bình quân gia quyền. Nguồn chưa cung cấp trường này: dùng EPS TTM Vietstock **công bố đúng kỳ** để tính P/E. Không giả dùng CP cuối kỳ như bình quân gia quyền. BVPS vẫn dùng CP cuối kỳ.
8. Tin chỉ dựa mô tả công khai, không crawl `/news/*` theo robots Simplize. Bỏ boilerplate báo lỗi/email khỏi mô tả. Không đủ nội dung thì từ chối mở rộng; không cố đạt số từ bằng cách bịa sự kiện.
9. Gemini allowlist Flash/Flash-Lite có free tier. Key ban đầu không hợp lệ; người dùng đã đổi key và live test mới thành công. Không ghi key trong source, output, fixture hay tài liệu. Có mock fallback 429, 5xx, timeout, schema sai; live tin đã quan sát model dự phòng thành công.
10. UI điểm tổng hợp luôn ghi do code tính; văn bản Gemini có evidence. Guard kiểm tra số/nguồn/từ ngữ tuyệt đối, **không chứng minh toàn bộ nhận định ngữ nghĩa đúng**; người dùng cần đọc dữ kiện gốc.

## Báo cáo theo phần

| Phần | Đã thực hiện | Kiểm tra / giới hạn |
|---|---|---|
| 0 — khảo sát/schema | Ba nguồn, mapping, công thức, fixture, Gemini catalog | Có HTTP thật. Không dùng endpoint đoán cho runtime. Một số endpoint nâng cao vẫn TODO |
| 1 — khung/tổng quan | FastAPI, Next.js strict TS, query lazy, chart, search, Dockerfile | Build production, local API và browser. Chưa chạy Cloud Run theo yêu cầu người dùng |
| 2 — fusion/tài chính | Provenance, chọn giá, cross-check BCTC, quý/năm, QoQ/YoY, CSV | 12 quý/3 năm công khai; phạm vi chưa công bố không bị giả xác nhận |
| 3 — hệ số/định giá | ROE/ROA/5 vòng quay/CCC/DuPont, EV/EBITDA, source discrepancy, band, vùng giá | Test tính tay; EPS công bố fallback; PEG/CAGR thiếu để null |
| 4 — so sánh/ngành | Peers cấp 2, median/mean, mẫu nhỏ, 2–5 mã, giá chuẩn hóa cùng ngày, radar, AI theo yêu cầu | Các mã khác ngành được cảnh báo; percentile radar chỉ của nhóm đang chọn |
| 5 — tin/AI | Khử trùng, 5 phần/120–200 từ, bản tổng hợp 200–300 từ, sắc thái sau khi đọc | Chỉ mô tả, không phải toàn văn. Tin quá ngắn có thể không tạo được digest hợp lệ |
| 6 — phân tích | Điểm/trụ cột, mạnh/yếu, so ngành, vùng giá, cờ, Gemini evidence, cổ đông/sự kiện | Live VNM thành công. Số liệu sở hữu không có ngày chốt được ghi rõ |
| 7 — hoàn thiện | Theme, localStorage, CSV, responsive, docs và script chạy local | Kết quả kiểm thử cuối trong `docs/validation.md` |

## TODO(verify) còn lại

- Phạm vi hợp nhất/riêng lẻ và audit của Simplize; phân biệt cột BCTC giữa hai nguồn bằng tài liệu gốc, không chỉ nhãn báo cáo.
- CP bình quân gia quyền/diluted EPS; CAGR 3/5 năm, PEG và lịch sử tự tái dựng adjusted P/E/P/B khi có dữ liệu công khai đủ sâu.
- URL từng bài gốc và toàn văn được phép khai thác; tin toàn thị trường/ngành từ đủ ba nguồn. Hiện link tin dẫn trang danh sách theo mã, có ghi nhãn.
- Chỉ số UPCoM overview hiện trả thiếu; Yahoo VEF.VN không có chuỗi giá. Không giả dữ liệu tương ứng.
- Chuỗi giao dịch nội bộ/khối ngoại/tự doanh, ban lãnh đạo đầy đủ, 52-week/MA support để đưa vào vùng kỹ thuật, lịch sự kiện tương lai đa nguồn.
- Percentile/rank so toàn ngành chỉ đại diện tập peers nguồn cung cấp, không phải toàn bộ universe niêm yết.
- Google Search grounding chưa bật. Dùng model trong free catalog không thay thế việc người dùng kiểm tra billing/tier của project key.
- Docker runtime, Lighthouse và IP Cloud Run chưa được kiểm chứng trong lượt local nếu không có bằng chứng riêng ở validation.

Các mục này là giới hạn hiện tại, **không được đánh dấu đã đạt trọn 14 tiêu chí của agent.md**. Không có dịch vụ trả phí nào được tự động tích hợp.
