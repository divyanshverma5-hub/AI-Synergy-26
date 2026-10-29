# Repository guide: Rights Regression Radar

AI-assisted analysis of proposed Indian legislation. FastAPI + SQLite backend,
React + Vite frontend. Decision support only — never state that a provision is
unconstitutional or invalid.

## Commands

```bash
# Backend (run from repo root)
.venv/bin/python -m uvicorn app.main:app --reload --port 8000 --app-dir backend
.venv/bin/python -m pytest backend/tests -q          # 52 tests

# Frontend
cd frontend && npm run dev                            # proxies /api -> :8000
cd frontend && npm test                               # 38 tests
cd frontend && npm run build

# End-to-end (needs a running backend)
.venv/bin/python scripts/e2e_smoke.py
```

## Architecture rules

- Keep the six pipeline stages separate: PDF extraction, clause splitting,
  retrieval, classification, explanation + rights tagging, review + audit.
- All analysis logic lives behind `app/providers/`. Never call a model from a
  router, a service, or the frontend. The browser talks only to this backend.
- The frontend must not depend on which provider is active.

## Vocabulary (do not rename in one layer only)

- Classifier labels: `conflicts`, `removes_safeguard`, `consistent`, `unrelated`
- Review statuses: `pending`, `confirmed`, `rejected`, `relabelled`,
  `insufficient_evidence`
- Health categories (presentation only): `clear`, `needs_review`,
  `safeguard_removed`, `direct_conflict`
- Rights tags: `article_14`, `article_19`, `article_21`
- Job statuses: `queued`, `processing`, `completed`, `failed`

Defined in `backend/app/models.py`, `backend/app/schemas.py` and
`frontend/src/constants.js`. Keep them in sync.

## Data honesty

- Never invent Acts, sections, quotations, source links, confidence scores or
  metrics. Missing evidence means `evidence_sufficient: false` and
  `requires_review: true`.
- Everything fictional is flagged `is_demonstration = true` and badged in the UI.
- Mock code lives only in `providers/mock.py`, `services/retrieval.py` and
  `seed/demo_data.py`. Keep it there; do not scatter hardcoded predictions in
  UI components. Mark every simulated location with a `MOCK`/`TODO(...)` comment
  and record it in `docs/MOCK_INVENTORY.md`.
- Reviewer decisions are append-only and must never trigger automatic
  retraining.

## Gotchas

- `frontend` tests: `user-event` v14 does not set `input.files` under React 19.
  Use `fireEvent.change` for file inputs (helper in `src/test/app.test.jsx`).
- Backend tests: `tests/conftest.py` sets env vars before importing `app.*`
  because `config.py` reads the environment at import time.
- The clause splitter must stay lossless. A heading and its first body sentence
  can share a line; never drop body text (regression tests in
  `tests/test_pipeline.py`).

## Docs

`docs/API.md`, `docs/SCHEMA.md`, `docs/ML_INTEGRATION.md`,
`docs/MOCK_INVENTORY.md`, `docs/LIMITATIONS.md`.
