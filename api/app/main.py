import asyncio
import json
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.http import NotFound, SourceError, SourceHTTP
from app.routers.api import router
from app.services import FinanceService


class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({'message': record.getMessage(), 'level': record.levelname,
                           **{k: getattr(record, k) for k in ['source', 'ticker', 'latency_ms', 'status', 'model_used']
                              if hasattr(record, k)}}, ensure_ascii=False)


handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger('finscope').addHandler(handler)
logging.getLogger('finscope').setLevel(logging.INFO)
# HTTPX request logs are intentionally disabled: secrets must never appear in URLs/log output.
logging.getLogger('httpx').setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    http = SourceHTTP()
    app.state.finance = FinanceService(http)
    yield
    await http.client.aclose()


app = FastAPI(title='FinScope API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[s.strip() for s in settings.allowed_origins.split(',')],
                   allow_methods=['GET'], allow_headers=['Accept', 'Content-Type'])
app.include_router(router)
requests: dict[str, deque] = defaultdict(deque)


def error(status: int, code: str, message: str):
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message,
                        'hint': 'Kiểm tra mã/nguồn hoặc thử lại sau.'}})


@app.middleware('http')
async def rate_limit(request: Request, call_next):
    if request.url.path in ('/health', '/api/health'):
        return await call_next(request)
    ip = request.client.host if request.client else 'unknown'
    now = time.monotonic()
    for key in list(requests):
        if requests[key] and requests[key][-1] < now-60:
            del requests[key]
    bucket = requests[ip]
    while bucket and bucket[0] < now-60:
        bucket.popleft()
    if len(bucket) >= 60:
        return error(429, 'rate_limit', 'Tối đa 60 yêu cầu/phút. Vui lòng chờ rồi thử lại.')
    bucket.append(now)
    try:
        async with asyncio.timeout(115):
            return await call_next(request)
    except TimeoutError:
        return error(503, 'request_timeout', 'Nguồn phản hồi quá chậm. Vui lòng thử lại sau.')


@app.exception_handler(SourceError)
async def source_error(request, exc: SourceError):
    if isinstance(exc, NotFound):
        return error(404, 'not_found', 'Không tìm thấy mã doanh nghiệp Việt Nam này.')
    return error(503, exc.status, 'Nguồn dữ liệu chưa khả dụng. Không có dữ liệu thay thế được xác minh.')


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return error(exc.status_code, 'invalid_request', str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return error(422, 'validation_error', 'Tham số không hợp lệ. Kiểm tra mã, kỳ báo cáo và nguồn dữ liệu.')


@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    logging.getLogger('finscope').error('unexpected_api_error', extra={'status': type(exc).__name__})
    return error(500, 'internal_error', 'Không thể xử lý yêu cầu này. Vui lòng thử lại.')


@app.get('/health')
async def cloud_health():
    return {'status': 'ok', 'service': 'FinScope'}
