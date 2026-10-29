"""Application configuration.

All runtime knobs are environment-driven so the analysis provider, database
location and upload limits can be swapped without touching code.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("RRR_DATA_DIR", BACKEND_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ANALYSIS_PROVIDER selects the analysis backend: "mock" (default) or "real".
ANALYSIS_PROVIDER = os.environ.get("ANALYSIS_PROVIDER", "mock").strip().lower()

# REAL_ANALYSIS_ENDPOINT is used by RealAnalysisProvider to reach the
# teammates' ML/retrieval service. See docs/ML_INTEGRATION.md.
REAL_ANALYSIS_ENDPOINT = os.environ.get("REAL_ANALYSIS_ENDPOINT", "")
REAL_ANALYSIS_TIMEOUT = float(os.environ.get("REAL_ANALYSIS_TIMEOUT", "120"))

DATABASE_URL = os.environ.get("RRR_DATABASE_URL", f"sqlite:///{DATA_DIR / 'radar.db'}")

MAX_UPLOAD_BYTES = int(os.environ.get("RRR_MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
ALLOWED_CONTENT_TYPES = {"application/pdf"}

# Seed demonstration legal provisions / bills on first startup.
SEED_DEMO_DATA = os.environ.get("RRR_SEED_DEMO", "1") not in {"0", "false", "False"}

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "RRR_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if o.strip()
]
