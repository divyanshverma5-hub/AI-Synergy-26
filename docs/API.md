# API reference

Base URL: `/api`. All requests and responses are JSON unless noted. Errors use
FastAPI's standard shape: `{"detail": "message"}` or, for validation failures,
`{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`.

Every list endpoint is paginated with `page` (1-based) and `page_size`.
Paginated responses share the shape:

```json
{ "items": [...], "total": 19, "page": 1, "page_size": 10, "pages": 2 }
```

## Health

### `GET /api/health`
```json
{
  "status": "ok",
  "analysis_provider": "mock",
  "disclaimer": "Decision support only. Outputs are not legal advice and never establish that a provision is unconstitutional or invalid."
}
```

## Documents

### `POST /api/documents` → 201
`multipart/form-data`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | file | yes | PDF only. Max 20 MB (`RRR_MAX_UPLOAD_BYTES`). |
| `title` | text | no | Defaults to the file name. |
| `version_label` | text | no | e.g. `2.0 draft`. |
| `document_date` | text | no | Free-form; stored as given. |
| `legal_status` | text | no | e.g. `proposed`, `in force`. |
| `source_reference` | text | no | Provenance of the document. |

Returns a `DocumentDetail`. Uploaded documents are **not** flagged
demonstration. Errors:

| Status | When |
| --- | --- |
| 415 | Not a `.pdf` file, or the bytes do not start with `%PDF-`. |
| 422 | Empty file, or the PDF has no extractable text layer. |
| 413 | Larger than the configured limit. |

### `GET /api/documents` → 200
Query: `search` (matches title or filename), `limit` (default 100). Returns a
list of `DocumentSummary`.

### `GET /api/documents/{id}` → 200
Returns `DocumentDetail`, including the full extracted `text` and the
`extraction_error` if extraction failed. 404 if unknown.

### `GET /api/documents/{id}/clauses` → 200
Ordered list of `ClauseOut`:

```json
{
  "id": "…", "document_id": "…", "ordinal": 4, "section_id": "3",
  "heading": "Blocking of content",
  "text": "The regulator may, by order, block access to any content …",
  "page_number": 1, "char_start": 493, "char_end": 783
}
```

### `GET /api/documents/{id}/clauses/{clause_id}/diff` → 200
Side-by-side comparison against the clause's matched earlier provision.

```json
{
  "clause_id": "…", "finding_id": "…",
  "provision": { "act_title": "…", "section_id": "Section 9", "text": "…", "…": "…" },
  "segments": {
    "old": [{"type": "equal|removed", "text": "…"}],
    "new": [{"type": "equal|added",   "text": "…"}]
  },
  "similarity": 0.2268,
  "is_demonstration": true
}
```

404 when no provision is linked; the UI shows an explicit "no matched
provision" message rather than an empty comparison.

## Analyses

### `POST /api/analyses` → 202
Body: `{"document_id": "…", "force": false}`. Creates a job with status
`queued` and starts it in a background worker.

| Status | When |
| --- | --- |
| 404 | Unknown document. |
| 409 | An analysis for this document is already `queued` or `processing`. Pass `"force": true` to run anyway. |
| 422 | The document has no clauses (usually a failed extraction). |

### `GET /api/analyses` → 200
Query: `document_id`, `status`, `limit`. Newest first.

### `GET /api/analyses/{id}` → 200
`AnalysisOut`:

```json
{
  "id": "…", "document_id": "…", "status": "completed",
  "provider": "mock", "progress": 100, "error": null,
  "is_demonstration": true, "clause_count": 6, "finding_count": 6,
  "started_at": "…", "finished_at": "…", "created_at": "…"
}
```

`status` is one of `queued`, `processing`, `completed`, `failed`.

### `GET /api/analyses/{id}/results` → 200
```json
{
  "analysis": { "…AnalysisOut…" },
  "document": { "…DocumentSummary…" },
  "counts": {
    "total": 6, "conflicts": 1, "removes_safeguard": 1, "consistent": 3, "unrelated": 1,
    "clear": 3, "needs_review": 1, "safeguard_removed": 1, "direct_conflict": 1,
    "pending": 6, "requires_review": 4
  },
  "findings": [ { "…FindingSummary…" } ]
}
```

Counts are computed from stored rows. Label counts use the settled reviewer
label where one exists, otherwise the prediction.

## Findings

### `GET /api/findings` → 200
Query parameters (all optional):

| Parameter | Notes |
| --- | --- |
| `page`, `page_size` | Pagination; `page_size` max 100. |
| `label` | One of the four classifier labels. Matches the settled label, else the prediction. |
| `review_status` | `pending`, `confirmed`, `rejected`, `relabelled`, `insufficient_evidence`. |
| `document_id`, `analysis_id` | Scope to one document or job. |
| `rights_tag` | `article_14`, `article_19`, `article_21`. |
| `requires_review` | `true` / `false`. |
| `health_category` | `clear`, `needs_review`, `safeguard_removed`, `direct_conflict`. |

Returns `PaginatedFindings`. Each item is a `FindingSummary` carrying its
`clause`, `provision` (or `null`), `evidence` list, `implications`, `rights_tags`
and `review_status`.

### `GET /api/findings/{id}` → 200
`FindingDetail` — a `FindingSummary` plus the full `reviews` history. 404 if
unknown.

## Reviews

### `GET /api/reviews` → 200
Query: `finding_id`, `reviewer`, `page`, `page_size`. Newest first.

### `POST /api/reviews` → 201
```json
{
  "finding_id": "…",
  "decision": "confirm | reject | relabel | insufficient_evidence",
  "updated_label": "conflicts",
  "reason": "…",
  "notes": "…",
  "reviewer": "reviewer-a",
  "is_usable_for_training": true
}
```

Rules enforced by the API:

- `updated_label` is **required** for `relabel`, must be one of the four labels,
  and must differ from the current settled label.
- `reason` is **required** for `reject`, `relabel` and `insufficient_evidence`.
- `finding_id` must exist (404 otherwise).

A new row is appended; nothing is overwritten. The finding's
`review_status`, `effective_label`, `health_category`, `requires_review` and
`evidence_sufficient` are recomputed from the decision, and an `audit_logs` row
is written. **No model is retrained.**

### `GET /api/reviews/training-export` → 200
```json
{ "count": 3, "records": [ { "…" } ], "note": "Reviewer corrections for a future training set. Submitting a review never retrains the model." }
```
Query: `document_id`, `page`, `page_size`. Exports reviewer corrections marked
`is_usable_for_training`.

## Audit log

### `GET /api/audit-log` → 200
Query: `entity_type`, `entity_id`, `action`, `actor`, `page`, `page_size`
(max 200). Newest first. Each entry:

```json
{
  "id": "…", "actor": "reviewer-a", "action": "review.relabel",
  "entity_type": "finding", "entity_id": "…",
  "previous_value": "{\"label\": \"removes_safeguard\", \"review_status\": \"pending\"}",
  "new_value": "{\"label\": \"conflicts\", \"review_status\": \"relabelled\"}",
  "reason": "…", "context": { "review_id": "…" },
  "created_at": "…"
}
```

Actions include `document.uploaded`, `document.extraction_failed`,
`analysis.created`, `analysis.processing`, `analysis.findings_persisted`,
`analysis.completed`, `analysis.failed`, `review.confirm`, `review.reject`,
`review.relabel`, `review.insufficient_evidence`, `metrics.imported`.

## Metrics

### `GET /api/model/metrics` → 200
```json
{
  "model_name": "relationship-classifier", "model_version": "demo-0.1",
  "is_demonstration": true,
  "labels": ["conflicts", "removes_safeguard", "consistent", "unrelated"],
  "per_class": [ { "label": "conflicts", "precision": 0.72, "recall": 0.68, "f1": 0.70, "support": 64 } ],
  "macro_f1": 0.775, "accuracy": 0.842, "micro_f1": 0.842,
  "confusion_matrix": { "labels": ["…"], "matrix": [[43, 11, 4, 6], "…"] },
  "test_set_size": 500,
  "retrieval_recall_at_k": { "k": 5, "recall": 0.83, "note": "…" },
  "human_review": { "findings_total": 19, "findings_reviewed": 1, "review_rate": 0.053, "decisions": {"confirm": 1} }
}
```

`is_demonstration` is `true` while the seeded placeholder metrics are in use;
the UI shows a warning banner in that case. Unavailable values are `null`, never
fabricated.

### `GET /api/dashboard` → 200
Counts, health breakdown, rights breakdown, recent documents, recent analyses
and the review queue — all computed from the database.
