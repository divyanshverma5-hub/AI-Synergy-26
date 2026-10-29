"""Rights Regression Radar - FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from .config import ANALYSIS_PROVIDER, CORS_ORIGINS, DATABASE_URL, SEED_DEMO_DATA
from .db import init_db
from .routers import analyses, documents, metrics, reviews

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("rights-radar")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if SEED_DEMO_DATA:
        from .seed.demo_data import seed

        seed()
    logger.info("Rights Regression Radar ready (provider=%s, db=%s)", ANALYSIS_PROVIDER, DATABASE_URL)
    yield


app = FastAPI(
    title="Rights Regression Radar API",
    version="1.0.0",
    description=(
        "Decision-support tooling for reviewing proposed Indian legislation against "
        "existing provisions. Not legal advice; it never declares a law invalid."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(analyses.router)
app.include_router(reviews.router)
app.include_router(metrics.router)


@app.exception_handler(SQLAlchemyError)
async def _db_error_handler(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "A database error occurred."})


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "analysis_provider": ANALYSIS_PROVIDER,
        "disclaimer": (
            "Decision support only. Outputs are not legal advice and never establish that a "
            "provision is unconstitutional or invalid."
        ),
    }
