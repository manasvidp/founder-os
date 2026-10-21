# Founder OS: one container serving both the React app and the API.

# 1) Build the React frontend
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn install --frozen-lockfile --non-interactive --network-timeout 600000
COPY frontend/ ./
RUN CI=false GENERATE_SOURCEMAP=false yarn build

# 2) Python API that also serves the built frontend
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
COPY --from=web /web/build /app/frontend/build
ENV STATIC_DIR=/app/frontend/build
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
