# Công thức và giới hạn tính toán

## Quy ước

TTM là tổng 4 quý **liên tiếp**, không nhân một quý với 4; năm dùng một báo cáo năm. Tồn lượng bình quân = (đầu kỳ + cuối kỳ)/2, đầu kỳ TTM là 4 quý trước. Không đủ đầu/cuối kỳ thì null. Quý bị khuyết làm dừng chuỗi TTM. Mẫu số thiếu/0 → null; P/E, P/B không dùng mẫu số âm. Chi phí giá vốn/lãi vay/Capex đầu vào âm được lấy trị tuyệt đối tại công thức tương ứng, không biến số thiếu thành 0.

## Sinh lời, hiệu quả, DuPont

| Chỉ số | Công thức |
|---|---|
| ROE | LNST mẹ TTM / bình quân (VCSH − lợi ích không kiểm soát) |
| ROA | LNST toàn DN TTM / TS bình quân |
| ROS | LNST toàn DN / doanh thu |
| Biên gộp / hoạt động | LN gộp / doanh thu; LN HĐKD / doanh thu |
| EBIT | LNTT + abs(chi phí lãi vay) |
| EBITDA | EBIT + khấu hao từ LCTT |
| Biên EBITDA | EBITDA / doanh thu |
| Vòng quay TS | Doanh thu TTM / TS bình quân |
| Vòng quay tồn kho | abs(giá vốn TTM) / tồn kho gộp bình quân |
| Vòng quay phải thu | Doanh thu TTM / phải thu KH ngắn hạn bình quân |
| Vòng quay phải trả | abs(giá vốn TTM) / phải trả người bán ngắn hạn bình quân |
| Vòng quay TSCĐ | Doanh thu TTM / TSCĐ ròng bình quân |
| DIO, DSO, DPO | 365 / các vòng quay tồn kho, phải thu, phải trả |
| CCC | DIO + DSO − DPO |
| Đòn bẩy DuPont | TS bình quân / tổng VCSH bình quân |
| ROE DuPont | ROS × vòng quay TS × đòn bẩy, dùng LNST **toàn DN** và tổng VCSH |

ROE dùng cổ đông mẹ còn DuPont dùng toàn DN: hai số có thể khác khi có lợi ích không kiểm soát. Chọn mẫu số ROE thuộc cổ đông mẹ để nhất quán với tử số; khác phương pháp nguồn được nêu trong note/cảnh báo, không làm cho hai số khớp bằng cách sửa dữ liệu.

## Thanh khoản, đòn bẩy, dòng tiền

| Chỉ số | Công thức |
|---|---|
| Hiện hành | TS ngắn hạn / nợ ngắn hạn |
| Nhanh | (TS ngắn hạn − tồn kho) / nợ ngắn hạn |
| Tiền | tiền và tương đương / nợ ngắn hạn |
| Nợ / VCSH | tổng nợ phải trả / tổng VCSH |
| Nợ vay ròng / EBITDA | (vay ngắn + vay dài − tiền) / EBITDA |
| Trả lãi | EBIT / abs(chi phí lãi vay) |
| CFO/LNST | CFO TTM / LNST toàn DN TTM |
| FCF | CFO − abs(chi mua TSCĐ/TS dài hạn) |

Ngân hàng/chứng khoán/bảo hiểm không áp dụng bộ vòng quay sản xuất, CCC, thanh khoản tồn kho, EV/EBITDA: null + lý do. NIM/CIR/NPL/LLR/CASA là số **nguồn công bố**, không giả nhận tự tính; không đủ dữ liệu để kiểm chứng các chỉ tiêu đó độc lập.

## Tăng trưởng và định giá

- YoY dòng chảy = (TTM hiện tại − TTM trước 4 quý) / abs(TTM trước 4 quý). Bảng BCTC cung cấp thay đổi QoQ/YoY từng chỉ tiêu đúng số kỳ.
- EPS độc lập = LNST mẹ TTM / CP bình quân gia quyền **nếu có trường bình quân được xác minh**. Nguồn hiện không có trường này. Runtime dùng EPS TTM Vietstock công bố khớp kỳ; **không dùng số CP cuối kỳ thay số CP bình quân**. Chọn chỉ Simplize/Yahoo có thể thiếu EPS tự tính/P/E.
- EPS YoY so EPS TTM của hai kỳ; không lấy tăng trưởng lợi nhuận thay tăng trưởng EPS nếu số CP thay đổi.
- BVPS = (VCSH − lợi ích không kiểm soát) / CP lưu hành **cuối kỳ** `op49`.
- P/E = giá được chọn / EPS TTM khả dụng; P/B = giá / BVPS; P/S = giá × CP cuối kỳ / doanh thu TTM.
- EV/EBITDA = (giá × CP cuối kỳ + vay ngắn + vay dài − tiền) / EBITDA.
- PEG chỉ tính được khi có EPS CAGR được xác minh >0. Lịch sử công khai hiện thiếu chiều sâu cần thiết cho CAGR 3/5 năm; **PEG giữ null**, không thay bằng YoY.
- Dividend yield tại header/bảng là **số nguồn công bố**, không tuyên bố đã tự ghép cổ tức 12 tháng với giá được chọn.
- TB 3 năm chỉ hiện khi đủ 3 quan sát năm hợp lệ; không lấy trung bình 1 quan sát rồi gắn nhãn 3 năm.

## Ngành, vùng giá và điểm

Ngành lấy danh sách peers nguồn, kiểm tra cùng mã ngành cấp 2, chọn tối đa 8 theo vốn hóa trong danh sách; tải tối đa 4 tác vụ peer đồng thời. Thống kê chỉ dùng cùng kỳ, bỏ multiple ≤0 hoặc >100, tính median chính/mean phụ/count/std. Ít hơn 3 mẫu cảnh báo; chỉ số thiếu không coi là 0.

P/E và P/B band dùng `op1/op2` lịch sử theo quý nguồn công bố, trung bình ±1σ/±2σ. Chưa tái dựng độc lập từng multiple từ giá cuối quý và EPS đã điều chỉnh, nên luôn giữ nhãn nguồn. Phương pháp A = EPS TTM × median P/E lịch sử; B = BVPS × median P/B lịch sử (ít nhất 8 quan sát hợp lệ); D = median ít nhất 2 giá mục tiêu CTCK trong 180 ngày. Trọng số 0,4/0,3/0,3 và chuẩn hóa lại trên phương pháp có dữ liệu. Football field: A/B dùng median ±1σ; D dùng min/max báo cáo.

`fair_mid` là bình quân có trọng số. Mua [75%,85%], giữ (85%,110%), bán [110%,125%] của fair_mid. Hỗ trợ/kháng cự chỉ dùng khi có dữ liệu hợp lệ; hiện chưa đưa kỹ thuật vào giá hợp lý. Cận vùng không được đảo. Tin cậy Cao khi ≥3 phương pháp và hệ số biến thiên <15%; Trung bình khi ≥2 và ≤30%; còn lại Thấp. Đây là độ hội tụ phương pháp, không phải xác suất giá sẽ đạt mục tiêu.

Điểm: percentile so peers cho từng chỉ tiêu, đảo chiều chỉ tiêu thấp là tốt, lấy trung bình trong mỗi trụ cột. Trọng số sinh lời 25%, tăng trưởng 20%, hiệu quả 15%, sức khỏe 20%, định giá 20%. Trụ cột thiếu bị loại và chuẩn hóa lại. Độ phủ là tổng trọng số × tỷ lệ chỉ tiêu có dữ liệu. Điểm mạnh/yếu: percentile ≥75/≤25. AI không thay điểm.

Cờ hiện có: hiện hành <1, CFO/LNST <0,8, nợ/VCSH >2, tăng trưởng LNST <0. Cờ mang nhãn kỳ hiện tại; không diễn đạt “kéo dài” khi chưa đo đủ các kỳ. Cờ xu hướng nhiều quý, MA200, nội bộ/khối ngoại là phần chưa được xác minh đầy đủ.

Các ngưỡng giá/chênh lệch nằm ở `config.py`; trọng số/nhóm điểm và cờ nằm trong module analytics tương ứng. Test số mẫu tính tay tại `api/tests/test_analytics.py`.
