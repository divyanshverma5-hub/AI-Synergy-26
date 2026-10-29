# Mock and temporary code inventory

Every location with simulated, hardcoded or temporary behaviour is marked in the
source with a `MOCK DATA`, `MOCK METRICS`, `SIMULATED JOB`, or `TODO(...)`
comment. This file lists them all so nothing simulated is mistaken for real.

## Analysis providers

| File | What is mock | Marker |
| --- | --- | --- |
| `backend/app/providers/mock.py` | The whole provider: heuristic label scoring, keyword rights tagging, demonstration explanations, demonstration evidence, demonstration implications. | `// MOCK DATA`, `// TODO(ML-INTEGRATION)`, `// TODO(RETRIEVAL-INTEGRATION)`, `// TODO(LEGAL-DATA)` |
| `backend/app/providers/mock.py:185` | Confidence is a heuristic score, not a calibrated probability. | `// MOCK DATA` |
| `backend/app/providers/base.py:79` | Provider factory. | `// TODO(ML-INTEGRATION)` |
| `backend/app/providers/real.py` | Real provider is implemented but needs an endpoint; no local inference. | `// TODO(ML-INTEGRATION)`, `// TODO(RETRIEVAL-INTEGRATION)` |

`MockAnalysisProvider` is the default (`ANALYSIS_PROVIDER=mock`). Everything it
returns is flagged `is_demonstration = true` at the analysis, evidence and
document level.

## Retrieval

| File | What is mock | Marker |
| --- | --- | --- |
| `backend/app/services/retrieval.py:46` | `MockRetriever` scores seeded provisions by keyword overlap instead of using a real legal retrieval pipeline. | `// TODO(RETRIEVAL-INTEGRATION)` |

## Seeded data

| File | What is mock | Marker |
| --- | --- | --- |
| `backend/app/seed/demo_data.py` | Fictional Acts, sections and quotations, two demonstration bills, and placeholder model metrics. All rows are written with `is_demonstration = true`. | `// MOCK DATA`, `// TODO(LEGAL-DATA)`, `// MOCK METRICS` |
| `backend/app/seed/demo_data.py:193` | Placeholder classifier metrics. | `// MOCK METRICS` |

Disable seeding with `RRR_SEED_DEMO=0`.

## Job execution

| File | What is mock | Marker |
| --- | --- | --- |
| `backend/app/services/analysis_runner.py:12` | Jobs run on an in-process thread pool with status written to the database. This is a real worker, but not a durable queue; a restart during a run leaves the job in `processing`. | `// SIMULATED JOB` |

## Training data

| File | What is mock | Marker |
| --- | --- | --- |
| `backend/app/services/review.py:7,143` | Reviewer corrections are stored and exportable, but nothing consumes them yet. | `// TODO(TRAINING-DATA)` |
| `backend/app/routers/reviews.py:128` | `GET /api/reviews/training-export` returns rows; no scheduled export job exists. | `// TODO(TRAINING-DATA)` |

## Metrics display

| File | What is mock | Marker |
| --- | --- | --- |
| `frontend/src/pages/ModelMetrics.jsx:40` | Warning banner shown while seeded metrics are in use. | `// MOCK METRICS` |

## Job status display

| File | What is mock | Marker |
| --- | --- | --- |
| `frontend/src/pages/AnalysisDetail.jsx:13` | Status is polled every 1.2s rather than streamed. | `// SIMULATED JOB`, `// TODO(ML-INTEGRATION)` |

## How mock data is kept separate

- `is_demonstration` is a column on `Document`, `Provision`, `Analysis`,
  `Evidence` and `ModelMetric`.
- Seeded rows are `true`; uploaded documents and real-provider results are
  `false`.
- The UI shows a "demonstration data" badge wherever the flag is set, and the
  analysis and metrics pages show an explicit banner.
- Mock logic lives only in `providers/mock.py`, `services/retrieval.py` and
  `seed/demo_data.py`. No page or component hardcodes a prediction.
