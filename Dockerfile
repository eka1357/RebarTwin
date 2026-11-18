FROM node:22-slim AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    DEMO_ONLY=true \
    REBARTWIN_WEB_DIST=/app/web/dist \
    PORT=8080

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install --no-cache-dir ".[api,reader]"

COPY examples/ ./examples/
COPY --from=web-builder /app/web/dist ./web/dist

EXPOSE 8080
CMD ["sh", "-c", "uvicorn rebartwin.api:app --host 0.0.0.0 --port ${PORT:-8080}"]
