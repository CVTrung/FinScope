# Repository-root build context. Default image is the API; use --target web
# with NEXT_PUBLIC_API_BASE_URL to build the second Cloud Run service.
FROM python:3.12-slim AS api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY api/pyproject.toml ./
COPY api/app ./app
RUN pip install --no-cache-dir . && useradd --create-home --uid 10001 finscope
USER finscope
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --timeout-keep-alive 65"]

FROM node:22-alpine AS web-deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS web-builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN node -e "const u=new URL(process.env.NEXT_PUBLIC_API_BASE_URL); if(u.protocol!=='https:' || ['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.pathname!=='/api' || u.search || u.hash || u.username || u.password) throw Error('Set NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_SERVICE.run.app/api');"
COPY --from=web-deps /app/node_modules ./node_modules
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=web-builder --chown=node:node /app/.next/standalone ./
COPY --from=web-builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]

# Cloud Run's generated Docker build looks for ./Dockerfile without a target.
# Deploy this as finscope-api first, then use cloudbuild.web.yaml for web.
FROM api AS default
