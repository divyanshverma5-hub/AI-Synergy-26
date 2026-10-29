# Connecting the real ML system

The application is built so the trained classifier and retrieval pipeline drop
in without touching the frontend or unrelated backend code. There is exactly one
seam: the analysis provider.

## The seam

```
routers/analyses.py
   └── services/analysis_runner.py
          └── providers.get_provider(ANALYSIS_PROVIDER)   <-- the seam
                 ├── providers/mock.py   MockAnalysisProvider   (default)
                 └── providers/real.py   RealAnalysisProvider   (your service)
```

`providers/base.py` defines the contract:

```python
class AnalysisProvider(Protocol):
    name: str
    is_demonstration: bool
    def analyze(self, clauses: list[Clause], session: Session) -> ProviderResult: ...
```

A provider owns stages 3-5 (retrieval, classification, explanation + rights
tagging). Stages 1-2 (PDF extraction, clause splitting) happen before it is
called and stage 6 (review, audit) after, so those never need to change.

## What is already done

`RealAnalysisProvider` is implemented, not a stub:

- It POSTs clauses to `REAL_ANALYSIS_ENDPOINT` as JSON.
- It validates the response against the schema in `docs/SCHEMA.md`.
- It rejects unknown labels, missing `clause_id`, malformed arrays and non-JSON
  bodies, so a broken model service fails loudly instead of producing empty or
  wrong results.
- It maps transport failures to clear messages: unreachable, HTTP error, or
  timeout. These surface as `analysis.status = "failed"` with the reason in
  `analysis.error`, which the UI displays.

If `REAL_ANALYSIS_ENDPOINT` is unset, the job fails immediately with:

```
REAL_ANALYSIS_ENDPOINT is not configured. Set it to the ML service URL
or run with ANALYSIS_PROVIDER=mock.
```

No findings are fabricated in that case.

## Steps to connect your model

### 1. Expose an HTTP endpoint

It must accept the request body in `docs/SCHEMA.md` (a `schema_version`,
`document_id` and a `clauses` array) and return `{"schema_version": "1.0",
"findings": [...]}`. The `clause_id` values you receive must be echoed back on
each finding so results can be attached to the right clause.

### 2. Point the application at it

```bash
export ANALYSIS_PROVIDER=real
export REAL_ANALYSIS_ENDPOINT=https://your-service.example/analyse
export REAL_ANALYSIS_TIMEOUT=180
```

Then start the backend as usual. `GET /api/health` will report
`"analysis_provider": "real"`.

### 3. Verify

```bash
# Upload a bill, start an analysis, and watch the status.
curl -s -X POST localhost:8000/api/analyses \
  -H 'Content-Type: application/json' \
  -d '{"document_id": "<id>"}'
curl -s localhost:8000/api/analyses/<analysis_id>
```

Findings returned by your service are stored with
`analysis.is_demonstration = false` and `evidence.is_demonstration = false`, so
they are never shown with a demonstration badge.

## Retrieval (stage 3)

Two options:

1. **Inside your service.** Do retrieval before classification and return the
   chosen provision in each finding's `evidence` array, plus `provision_id` if
   you also want the side-by-side diff. To enable the diff view, the referenced
   provision must exist in the `provisions` table. Either import your corpus into
   that table, or extend `RealAnalysisProvider` to upsert provisions as it parses
   findings.
2. **Replace `services/retrieval.py`.** `MockRetriever` implements the
   `Retriever` protocol (`retrieve(text, limit) -> list[RetrievedProvision]`).
   Swap in a vector-store implementation and the mock provider will use it too,
   which is useful for testing.

## What does not change

- No frontend file needs editing. Components read the API response shapes only.
- No router, schema or model change is required for the four-class flow.
- The review and audit path is independent of the provider.

## Metrics (stage 4 evaluation)

`GET /api/model/metrics` reads `ModelMetric` rows. Replace the seeded
demonstration rows with your evaluation report by inserting one row per label
with `is_demonstration = false`, plus the aggregate figures. The UI drops the
"demonstration metrics" banner automatically once no seeded rows remain.

## Checklist

- [ ] Endpoint returns the response shape in `docs/SCHEMA.md`.
- [ ] Every finding echoes a valid `clause_id`.
- [ ] `predicted_label` is one of the four labels.
- [ ] Evidence rows carry real `source_title` and, where available,
      `source_reference` / `source_url`.
- [ ] `evidence_sufficient` is `false` when evidence is missing, rather than
      guessing.
- [ ] `ANALYSIS_PROVIDER=real` and `REAL_ANALYSIS_ENDPOINT` are set.
- [ ] `GET /api/health` reports `real`.
- [ ] An uploaded (non-demonstration) bill produces `is_demonstration = false`
      findings.
