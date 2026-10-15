# API only: safe for both legacy Docker builder and BuildKit.
# Build the frontend separately with Dockerfile.web.
FROM python:3.12-slim AS api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY api/pyproject.toml ./
COPY api/app ./app
RUN pip install --no-cache-dir . && useradd --create-home --uid 10001 finscope
USER finscope
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --timeout-keep-alive 65"]
