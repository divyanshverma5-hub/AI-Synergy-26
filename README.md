# Rights Regression Radar

An AI-assisted analysis tool for proposed Indian legislation. Upload a draft bill
as a PDF and the system helps you find:

- potential conflicts with existing legal provisions,
- safeguards, exemptions, appeal rights or protections that appear removed or
  weakened,
- clauses potentially relevant to Articles 14, 19 and 21 of the Constitution,
- uncertain findings that need human review,
- possible benefits, drawbacks and affected interests where evidence supports them.

> **Decision support only.** This tool does not provide legal advice and never
> concludes that a provision is unconstitutional or legally invalid.

## Repository layout

```
backend/            FastAPI application
  app/
    config.py         environment-driven settings
    db.py             SQLAlchemy engine + session
    models.py         ORM tables
    schemas.py        Pydantic request/response models
    serializers.py    ORM -> API shape helpers
    main.py           app factory, CORS, startup, health
    routers/          documents, analyses, reviews, metrics
    services/         pdf_extract, clauses, diffing, retrieval, health,
                      audit, analysis_runner, review
    providers/        base (interface), mock, real  <- ML integration seam
    seed/             demonstration data (fictional)
  tests/              pytest suite
frontend/           React + Vite single-page app
  src/
    api.js            the only place that talks to the backend
    constants.js      shared vocabulary (labels, statuses, categories)
    components/       layout, badges, feedback, hooks
    pages/            one file per screen
    test/             vitest suite
docs/               API reference, data schema, ML integration guide
```

## Requirements

- Python 3.11+ (developed on 3.13)
- Node.js 20+ (developed on 24) and npm

## Setup and run

From the repository root:

```bash
# 1. Backend
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000 --app-dir backend
# -> http://127.0.0.1:8000  (interactive docs at /docs)

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev
# -> http://127.0.0.1:5173
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`, so the browser
only ever talks to the application backend. Nothing in the frontend contacts a
model file or inference service directly.

On first startup the backend creates the SQLite database at
`backend/data/radar.db` and seeds two demonstration bills with findings. Set
`RRR_SEED_DEMO=0` to skip seeding.

### Production build

```bash
cd frontend && npm run build     # outputs frontend/dist
```

## Tests

```bash
# Backend: 52 tests
.venv/bin/python -m pytest backend/tests -q

# Frontend: 38 tests
cd frontend && npm test
```

Both suites run offline and do not require a live server.

An end-to-end smoke test drives the full workflow (upload → analysis → findings
→ review → audit → metrics) against a running backend:

```bash
.venv/bin/python -m uvicorn app.main:app --port 8000 --app-dir backend &
.venv/bin/python scripts/e2e_smoke.py     # 50 checks
```

## Configuration

All settings are environment variables. Defaults work for local development.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANALYSIS_PROVIDER` | `mock` | `mock` or `real` |
| `REAL_ANALYSIS_ENDPOINT` | *(empty)* | URL of the ML/retrieval service |
| `REAL_ANALYSIS_TIMEOUT` | `120` | Seconds to wait for the ML service |
| `RRR_DATABASE_URL` | `sqlite:///backend/data/radar.db` | Database URL |
| `RRR_DATA_DIR` | `backend/data` | Uploads and database location |
| `RRR_MAX_UPLOAD_BYTES` | `20971520` | Upload limit (20 MB) |
| `RRR_SEED_DEMO` | `1` | Seed demonstration data on startup |
| `RRR_CORS_ORIGINS` | localhost:5173, :4173 | Allowed browser origins |
| `VITE_API_BASE` | `/api` | Frontend API base path |

## Documentation

- [`docs/API.md`](docs/API.md) — every endpoint, parameters and error codes.
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — the shared JSON schema and label vocabulary.
- [`docs/ML_INTEGRATION.md`](docs/ML_INTEGRATION.md) — how to connect the trained model.
- [`docs/MOCK_INVENTORY.md`](docs/MOCK_INVENTORY.md) — every mock component and its file.
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — what is not finished.
