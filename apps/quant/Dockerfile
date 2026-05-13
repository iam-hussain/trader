FROM python:3.11-slim-bookworm

WORKDIR /app
# PIP_NO_CACHE_DIR is intentionally NOT set — we mount a BuildKit cache at
# ~/.cache/pip so wheels persist across rebuilds (including --no-cache ones).
ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN --mount=type=cache,id=apt,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl

COPY pyproject.toml ./
RUN --mount=type=cache,id=pip,target=/root/.cache/pip \
    pip install fastapi 'uvicorn[standard]' httpx yfinance pandas numpy \
    pandas-ta-classic lxml beautifulsoup4 feedparser duckdb pyarrow \
    python-dotenv pydantic tenacity h2 prophet arch

COPY . .
EXPOSE 8000
CMD ["python", "main.py"]
