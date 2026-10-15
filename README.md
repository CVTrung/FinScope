# FinScope

Dashboard tiếng Việt để tra cứu, phân tích và so sánh doanh nghiệp HOSE/HNX/UPCoM. **FastAPI + Next.js/TypeScript + Tailwind + ECharts**, dữ liệu công khai Vietstock/Simplize/Yahoo và diễn giải Gemini.

## Chạy local trên máy này

Mở hai terminal PowerShell tại `D:\Project\FinScope2`:

```powershell
# Terminal 1: API
Set-Location D:\Project\FinScope2\api
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2: web production
Set-Location D:\Project\FinScope2\web
npm run build
npm start
```

Mở **http://localhost:3000**. API docs: **http://localhost:8000/docs**; health: **http://localhost:8000/health**. Khi phát triển thay `npm start` bằng `npm run dev`. Không chạy build và dev cùng lúc trong cùng thư mục `.next`.

Có thể chạy `powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Production` sau khi đã build. Script khởi động hai tiến trình ẩn và dừng cây tiến trình do nó tạo khi Ctrl+C; không dừng service khác.

## Cài lại dependencies

Yêu cầu Node.js 22+ và Python 3.12. Môi trường local của lượt thực hiện đã được tạo trong `.venv` bằng uv; Windows cần `tzdata` (đã có trong dependencies).

```powershell
Set-Location D:\Project\FinScope2
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe -e ".\api[dev]"
npm ci --prefix web
```

Giữ `.env` hiện tại; không ghi đè key. Nếu cài mới, sao chép `.env.example` sang `.env` rồi cấu hình `GEMINI_API_KEY` hoặc `GOOGLE_API_KEY`. Cả hai tên được hỗ trợ ở **backend**; nếu đồng thời tồn tại, `GEMINI_API_KEY` được ưu tiên. Khởi động lại API sau khi đổi key. `NEXT_PUBLIC_API_BASE_URL` của web mặc định là `http://localhost:8000/api`; khi đổi, đặt trong `web/.env.local` **trước khi build**.

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL_CHAIN=gemini-2.5-flash,gemini-2.5-flash-lite
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DISABLED_SOURCES=
```

Key không xuất hiện trong frontend. Chỉ allowlist Gemini có free tier; không bật grounding hay provider trả phí. Hạn mức thực tế và billing tier thuộc Google project của key, không được suy ra từ tên model.

## Các phần sản phẩm

1. **Tổng quan**: chỉ số thị trường, tìm mã/tên, biểu đồ giá và danh sách doanh nghiệp.
2. **Doanh nghiệp**: tổng quan; KQKD/CĐKT/LCTT quý/năm; hệ số có ROE/ROA/5 vòng quay/CCC/DuPont; định giá/band/vùng giá; cổ đông; sự kiện; tin; phân tích AI.
3. **So sánh**: 2–5 mã trong URL, bảng chỉ tiêu, cảnh báo khác ngành, giá chuẩn hóa cùng ngày và radar; diễn giải Gemini khi bấm tạo.
4. **Theo dõi**: watchlist/recent/theme chỉ ở localStorage; không đăng nhập, không lưu database.
5. **AI**: điểm/vùng giá/ứng viên mạnh-yếu/cờ được tính bằng code. Gemini chỉ diễn giải facts, có evidence, JSON schema và guard kiểm tra số. Model lỗi có retry/fallback; bảng code vẫn xem được khi AI lỗi.

Các số thiếu hiện `—`, chỉ tiêu không phù hợp ngành hiện `N/A`. Nhấn nguồn hoặc di chuột vào giá trị để xem kỳ, thời điểm, ghi chú và alternate. Bảng có xuất CSV; bảng lớn cuộn ngang trên mobile. Nội dung phục vụ học tập, không phải khuyến nghị đầu tư.

## Dữ liệu và giới hạn cần biết

- Lấy trực tiếp, cache trong bộ nhớ có TTL/single-flight, mất khi restart. Runtime **không đọc fixture hoặc ghi dữ liệu vào đĩa**.
- Simplize cho lịch sử công khai 12 quý/3 năm trong lượt kiểm tra; sâu hơn bị yêu cầu đăng nhập. PEG/CAGR thiếu dữ liệu giữ null; không thay bằng công thức khác.
- EPS TTM dùng số Vietstock công bố khi chưa có CP bình quân gia quyền để tự tính độc lập. Phạm vi/audit chưa được Simplize công bố được ghi rõ; không giả coi các nguồn cùng phạm vi.
- Band lịch sử là multiple do nguồn công bố, chưa tái dựng độc lập giá cuối kỳ/adjusted EPS. Vùng giá là kết quả phương pháp tham khảo, không phải cam kết mua/bán.
- Tin hiện dựa mô tả công khai; quá ngắn sẽ không tạo digest. Link nguồn hiện đến danh sách tin theo mã. Không gọi văn bản mô tả là toàn văn.
- Yahoo không phủ mọi mã Việt Nam, ví dụ VEF; chỉ số UPCoM overview chưa lấy được từ endpoint đã kiểm tra. Giao diện giữ thiếu đúng thực tế.
- Chưa hoàn tất toàn bộ dữ liệu nâng cao của `agent.md`; xem danh sách `TODO(verify)` và báo cáo trung thực ở [docs/decisions.md](docs/decisions.md).

## Kiểm thử

```powershell
Set-Location D:\Project\FinScope2\api
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\ruff.exe check app tests
..\.venv\Scripts\mypy.exe app
Set-Location ..\web
npm run typecheck
npm run build
```

Test tự động dùng số mẫu tính tay, fixture và mock; không cần key/mạng. Smoke script **có gọi mạng thật** khi chạy thủ công:

```powershell
Set-Location D:\Project\FinScope2
.venv\Scripts\python.exe scripts\smoke_sources.py
.venv\Scripts\python.exe scripts\live_complete.py
```

`artifacts/` giữ kết quả local, được gitignore. Các mã đã khảo sát gồm VNM, FPT, VCB, HPG, SSI, VHM, VEF (UPCoM). Kết quả và giới hạn xác minh tại [docs/validation.md](docs/validation.md).

## Docker local

```powershell
docker compose up --build
```

Compose có hai service API/web, không DB. `.env` chỉ truyền cho API; build web chỉ nhận URL công khai. Cấu hình Compose đã kiểm tra cú pháp; kết quả build/run image Dockerfile gốc được ghi ở `docs/validation.md`. Có thể chạy trực tiếp bằng hai terminal như trên.

## Tự triển khai Cloud Run

### Sửa lỗi `/workspace/Dockerfile: no such file or directory`

Build từ GitHub có context là **gốc repository**, trong khi Dockerfile cũ chỉ nằm ở `api/` và `web/`. `Dockerfile` ở gốc chỉ build **API**; `Dockerfile.web` ở gốc chỉ build **web**. Hai file độc lập để tương thích cả legacy Docker builder và BuildKit; build API không chạy npm hoặc yêu cầu URL API. Một image mặc định này không phục vụ giao diện Next.js. Dự án vẫn triển khai thành **hai service** theo `agent.md`.

Thực hiện theo thứ tự sau trong Google Cloud Console sau khi đưa các file mới lên GitHub:

1. **API trước**: tại Cloud Build → Triggers, sửa trigger đang lỗi. Chọn **Cloud Build configuration file**, đường dẫn `cloudbuild.api.yaml` (context gốc repo). Thêm substitution `_IMAGE=asia-southeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/finscope-api:COMMIT_TAG`; thay project/repository/tag bằng giá trị thật. Mặc định service `finscope-api`, region `asia-southeast1`; có thể đổi `_SERVICE_NAME` và `_REGION` trong trigger. Config tự build, push và deploy.
2. Khi API chạy, lấy URL Cloud Run của API và kiểm tra `https://YOUR_API_URL/health`. Trong phần Variables & Secrets của **API**, gắn `GEMINI_API_KEY` hoặc `GOOGLE_API_KEY` từ Secret Manager; key không đưa vào build args/GitHub. API vẫn chạy khi chưa có key nhưng các phần AI sẽ không khả dụng.
3. **Web**: tạo trigger thứ hai cùng repository, dùng `cloudbuild.web.yaml`. Thêm `_IMAGE=asia-southeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/finscope-web:COMMIT_TAG` và `_API_BASE_URL=https://YOUR_API_URL/api` (không thêm `/` cuối). Mặc định deploy thành `finscope-web`. URL này được đóng vào JavaScript lúc build; chỉ sửa biến môi trường lúc chạy web sẽ không đổi URL trong trình duyệt.
4. Sau khi web có URL, đặt `ALLOWED_ORIGINS=https://YOUR_WEB_URL` trong biến môi trường **API**, rồi tạo revision mới. Mở web và kiểm tra tìm mã, bảng số liệu, tin tức và AI. Giữ timeout request tối thiểu 120 giây như các file build đã cấu hình.

Artifact Registry repository phải tồn tại. Service account của từng trigger cần quyền ghi Artifact Registry, ghi log, deploy Cloud Run và `Service Account User` trên runtime service account; service account API cần quyền đọc secret được gắn. Các config sử dụng `--allow-unauthenticated` vì web gọi trực tiếp API công khai. Nếu đã có trigger cũ tự build/deploy cùng service, sửa hoặc tắt trigger đó để tránh hai pipeline ghi đè nhau. Hướng dẫn chính thức: https://docs.cloud.google.com/build/docs/deploying-builds/deploy-cloud-run.

Nếu giữ màn hình build kiểu **Dockerfile** của trigger cũ, đường dẫn `Dockerfile`, context `.` hiện build được API mặc định. Vẫn phải tạo service web riêng bằng config bên trên; đừng dùng cùng tên service cho cả hai trigger.

Kiểm tra image local từ gốc repo (Docker Desktop cần đang chạy):

```powershell
docker build --target api -t finscope-api:local .
docker run --rm -p 8080:8080 -e PORT=8080 finscope-api:local
# Terminal khác: kiểm tra http://localhost:8080/health
docker build -f Dockerfile.web --target web --build-arg NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_URL/api -t finscope-web:local .
docker run --rm -p 3001:8080 -e PORT=8080 finscope-web:local
```

Các Dockerfile trong `api/`, `web/` vẫn dùng context thư mục tương ứng cho Docker Compose local. `.dockerignore` gốc loại `.env`, key, node_modules và artifact local khỏi context cloud. Không tự triển khai lên Google Cloud từ workspace này.

### Sửa lỗi `ERR_INVALID_URL`, `input: ''` khi build API

Log `Step 19/31` gọi Node để kiểm tra URL trong khi đang build API là do Dockerfile gộp cũ. Legacy builder chạy mọi stage phía trước image cuối; BuildKit local có thể bỏ qua stage không liên quan. Đã thay bằng hai file độc lập: trigger Dockerfile hiện tại giữ đường dẫn `Dockerfile`, context `.`, không cần URL web/API để build backend. Cần push commit chứa bản sửa mới rồi chạy build commit mới; retry commit cũ vẫn lỗi.

Nếu build **web**, dùng `cloudbuild.web.yaml` mới hoặc `Dockerfile.web` với build arg `NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_URL/api`. Web vẫn bắt buộc có URL API thật lúc build. Đổi biến môi trường runtime sẽ không thay giá trị đã compile.

### Lệnh triển khai thủ công với Dockerfile từng thư mục

Hai service độc lập, stateless. Lệnh dưới là mẫu, thay PROJECT_ID/REGION/URL. Không có lệnh deploy nào đã được thực thi bởi agent.

```powershell
# API: chạy tại thư mục api; source deploy sử dụng Dockerfile có sẵn
gcloud run deploy finscope-api --source ./api --region asia-southeast1 --allow-unauthenticated --memory 1Gi --concurrency 20 --max-instances 3 --min-instances 0 --timeout 120 --set-secrets GEMINI_API_KEY=finscope-gemini-key:latest --set-env-vars GEMINI_MODEL_CHAIN=gemini-2.5-flash
```

Tạo secret `finscope-gemini-key` trong Secret Manager và cấp quyền đọc cho service account API trước; không đưa key vào đối số `--set-env-vars`. Có thể cấu hình chuỗi model có dấu phẩy bằng giao diện Cloud Run hoặc env-vars file để tránh cú pháp phân tách dấu phẩy của gcloud.

Web cần build-time `NEXT_PUBLIC_API_BASE_URL`. Ví dụ build image bằng Docker, rồi push/deploy:

```powershell
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_URL/api -t asia-southeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/finscope-web:latest ./web
docker push asia-southeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/finscope-web:latest
gcloud run deploy finscope-web --image asia-southeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/finscope-web:latest --region asia-southeast1 --allow-unauthenticated --memory 512Mi --max-instances 3
```

Sau khi biết URL web, đặt `ALLOWED_ORIGINS=https://YOUR_WEB_URL` trên API và kiểm tra CORS. Cổng Docker mặc định 8080, cả hai đọc `$PORT`, Next chạy standalone. Không dùng localhost làm API URL trong bản cloud. Đặt secret qua Secret Manager, `.env` không tự được upload.

Kiểm tra `/health`, tìm mã, các tab và `/api/sources/status` sau deploy. IP Cloud Run có thể bị nguồn hạn chế dù local hoạt động; dùng `DISABLED_SOURCES` để tắt connector gặp vấn đề, không vượt cơ chế chống bot. Rate limit local mỗi IP là 60 request/phút/instance; chưa coi là quota toàn hệ thống khi scale nhiều instance.

## Cấu trúc

`api/app/connectors`: dữ liệu thô; `fusion`: đơn vị/kỳ/provenance; `analytics`: công thức/ngành/điểm/vùng; `ai`: prompt/schema/guard/Gemini; `core`: HTTP/cache; `routers`: API. `web/src`: app routes, component trình bày, typed API client, chart. Tài liệu chi tiết: [mapping](docs/data-mapping.md), [công thức](docs/formulas.md), [quyết định](docs/decisions.md).


### Phân tích sâu và nguồn bổ sung
- Chuỗi Gemini mặc định ưu tiên 3.8 Flash rồi hạ dần; chỉnh `GEMINI_MODEL_CHAIN` trong `.env` nếu hạn mức tài khoản thay đổi. Danh sách miễn phí được giới hạn theo các model đã kiểm tra; không tự bật billing.
- Tab Phân tích AI có “Phân tích sâu”: nhập câu hỏi → AI chọn hướng → code đọc thêm nguồn và tính chỉ số → AI tổng hợp bằng chứng. Có thể mất khoảng một phút khi nguồn/model chậm.
- Tin tự tạo tóm tắt và đánh giá ảnh hưởng theo nhóm; sự kiện xử lý sáu mục mỗi trang, đọc PDF hoặc PDF scan. Nhấn “Cũ hơn” để đọc nhóm tiếp theo.
- Backend thêm `pypdf`, `pypdfium2`, `Pillow` cho tài liệu và ảnh xem trước; cài từ `api/pyproject.toml` như các dependency còn lại. Key chỉ ở backend.
