"""Trader Daily — quant + scraping service (Phase 1).

Phase 1 endpoints are deliberately thin wrappers over yfinance + a couple of
free RSS feeds. Phase 2 layers in CBOE / NASDAQ / Barchart / OptionCharts /
SEC EDGAR / OpenInsider scrapers behind interfaces in `scrapers/`.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from scrapers.yahoo import fetch_quote, fetch_news, fetch_options_snapshot


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(os.environ.get("PARQUET_DIR", "./data/parquet"), exist_ok=True)
    yield


app = FastAPI(title="trader-quant", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "service": "quant"}


@app.get("/quote/{symbol}")
def quote(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    try:
        return fetch_quote(sym)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"quote_failed: {e}") from e


@app.get("/news/{symbol}")
def news(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    try:
        return {"symbol": sym, "articles": fetch_news(sym)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"news_failed: {e}") from e


@app.get("/options/{symbol}")
def options(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    try:
        return fetch_options_snapshot(sym)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"options_failed: {e}") from e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("QUANT_PORT", "8000")),
        reload=os.environ.get("NODE_ENV", "development") == "development",
    )
