# Limitations and unfinished work

## Analysis quality

- The default analysis provider is `MockAnalysisProvider`. Its labels come from
  keyword heuristics over a small seeded corpus. They are **not** model output
  and are clearly labelled as demonstration data throughout the UI.
- The comparison corpus is two fictional Acts. Real coverage depends on the
  retrieval pipeline the ML team connects.
- Confidence values from the mock provider are heuristic scores, not calibrated
  probabilities. The UI labels them "demonstration score".
- Model metrics are seeded placeholders. `GET /api/model/metrics` reports
  `is_demonstration: true` and the UI shows a warning banner until real
  evaluation rows are imported.

## Legal content

- Every Act, section and quotation in the seeded data is fictional. There are no
  real citations, source links or statutory texts anywhere in the repository.
- The tool never concludes that a provision is unconstitutional or invalid. It
  flags clauses for human review. This is enforced in the schema (rights tags
  are review triggers) and stated in the UI on every relevant page.

## Job processing

- Jobs run on an in-process thread pool. They are not durable: a server restart
  during a run leaves the analysis in `processing`. A production deployment
  should use a real queue.
- Status updates are polled by the client (every 1.2s), not streamed.
- Only one active analysis per document is allowed by default; `force: true`
  overrides this.

## PDF handling

- Text extraction uses `pypdf`. Scanned PDFs without a text layer cannot be
  read; the upload is rejected with a clear message rather than silently
  producing an empty document.
- Clause splitting relies on numbered-section patterns (`3.`, `Section 3.`,
  `CHAPTER II`). Bills with unusual numbering may split imperfectly, though
  splitting is now lossless: no body text is dropped.
- Section identifiers are preserved where the document provides them.

## Review workflow

- Reviewer identity is a free-text name. There is no authentication or
  authorisation layer; anyone who can reach the API can record a decision.
- The training export exists as an endpoint but no scheduled job writes a
  dataset, and no retraining is wired up. This is deliberate: reviewer decisions
  must not trigger automatic retraining.
- Audit entries are append-only in application code but nothing prevents direct
  database edits.

## Frontend

- There is no authentication, so all pages are open.
- The clause-text search on the Clause Explorer filters the current page
  client-side. Server-side full-text search over clause bodies is not
  implemented.
- Implications are shown per finding; there is no cross-document aggregate view.
- No accessibility audit has been performed beyond semantic HTML and labelled
  form controls.

## Not implemented

- Authentication and per-reviewer permissions.
- A durable background queue and job cancellation.
- Import of a real legal corpus (statutes, amendments, commencement dates).
- Scheduled training-set export and model retraining.
- Server-side full-text search across clause text.
