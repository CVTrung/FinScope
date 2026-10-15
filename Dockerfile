# One Cloud Run service: Next.js on $PORT proxies /api to local FastAPI.
# All stages are required, including with the legacy Docker builder.
FROM node:22-bookworm-slim AS web-deps
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM web-deps AS web-builder
ENV NEXT_TELEMETRY_DISABLED=1 FINSCOPE_COMBINED=1 NEXT_PUBLIC_API_BASE_URL=/api
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY api/pyproject.toml ./
COPY api/app ./app
RUN pip install --no-cache-dir .

FROM api AS combined
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 finscope
COPY --from=web-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=web-builder --chown=finscope:finscope /web/.next/standalone /web
COPY --from=web-builder --chown=finscope:finscope /web/.next/static /web/.next/static
COPY scripts/start-container.py /app/start-container.py
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
USER finscope
EXPOSE 8080
CMD ["python", "/app/start-container.py"]
