import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import {
  DECISION_TEXT,
  LABEL_TEXT,
  PREDICTED_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_TEXT,
  RIGHTS_SHORT,
} from '../constants'
import {
  ConfidenceBadge,
  DemoBadge,
  LabelBadge,
  ReviewStatusBadge,
} from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading, Pagination } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const PAGE_SIZE = 10

const REASON_REQUIRED = new Set(['relabel', 'reject', 'insufficient_evidence'])

export default function ReviewCenter() {
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(params.get('finding') || null)
  const [form, setForm] = useState({
    decision: 'confirm',
    updated_label: '',
    reason: '',
    notes: '',
    reviewer: 'reviewer',
    is_usable_for_training: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [flash, setFlash] = useState(null)

  const page = Number(params.get('page') || 1)
  const statusFilter = params.get('status') || ''
  const documentId = params.get('document') || ''

  const documents = useAsync(() => api.listDocuments(), [])
  const queue = useAsync(
    () =>
      api.listFindings({
        page,
        page_size: PAGE_SIZE,
        document_id: documentId || undefined,
        review_status: statusFilter || undefined,
        requires_review: statusFilter ? undefined : true,
      }),
    [page, statusFilter, documentId],
  )

  const items = useMemo(() => queue.data?.items || [], [queue.data])

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !items.some((finding) => finding.id === selectedId)) {
      setSelectedId(items[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const selected = items.find((finding) => finding.id === selectedId) || null

  const detail = useAsync(
    () => (selected ? api.getFinding(selected.id) : Promise.resolve(null)),
    [selected?.id],
    { immediate: Boolean(selected) },
  )

  const finding = detail.data

  // Reset the form whenever a different finding is opened so a stale reason or
  // label can never be submitted against the wrong clause.
  useEffect(() => {
    setForm({
      decision: 'confirm',
      updated_label: '',
      reason: '',
      notes: '',
      reviewer: form.reviewer || 'reviewer',
      is_usable_for_training: true,
    })
    setSubmitError(null)
    setFlash(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const setParam = useCallback(
    (key, value, { resetPage = true } = {}) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      if (resetPage) next.delete('page')
      setParams(next)
    },
    [params, setParams],
  )

  const reasonMissing = REASON_REQUIRED.has(form.decision) && !form.reason.trim()
  const labelMissing = form.decision === 'relabel' && !form.updated_label

  const submit = useCallback(
    async (event) => {
      event.preventDefault()
      setSubmitError(null)
      setFlash(null)
      if (!finding) return
      if (reasonMissing) {
        setSubmitError(`A reason is required when the decision is “${DECISION_TEXT[form.decision]}”.`)
        return
      }
      if (labelMissing) {
        setSubmitError('Choose the corrected label before saving a relabelled decision.')
        return
      }
      setSubmitting(true)
      try {
        await api.createReview({
          finding_id: finding.id,
          decision: form.decision,
          updated_label: form.decision === 'relabel' ? form.updated_label : undefined,
          reason: form.reason.trim(),
          notes: form.notes.trim(),
          reviewer: form.reviewer.trim() || 'reviewer',
          is_usable_for_training: form.is_usable_for_training,
        })
        setFlash(`Saved a “${DECISION_TEXT[form.decision]}” decision for this finding.`)
        setForm((current) => ({ ...current, reason: '', notes: '', updated_label: '' }))
        await Promise.all([detail.refetch(), queue.refetch()])
      } catch (cause) {
        setSubmitError(cause.message)
      } finally {
        setSubmitting(false)
      }
    },
    [finding, form, reasonMissing, labelMissing, detail, queue],
  )

  return (
    <>
      <PageHeader title="Human review center">
        <p>
          Inspect the evidence, then confirm, reject or change a prediction. Every decision is
          stored with its reason and reviewer and appears in the audit log. Decisions are never
          overwritten, and submitting one does not retrain any model.
        </p>
      </PageHeader>

      <div className="card">
        <div className="filters">
          <label className="field">
            <span>Document</span>
            <select
              value={documentId}
              onChange={(event) => setParam('document', event.target.value)}
            >
              <option value="">All documents</option>
              {(documents.data || []).map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Review status</span>
            <select
              value={statusFilter}
              onChange={(event) => setParam('status', event.target.value)}
            >
              <option value="">Awaiting review</option>
              {REVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {REVIEW_STATUS_TEXT[status]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setParams({})
              setSelectedId(null)
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {flash ? <Alert tone="ok" title="Decision saved">{flash}</Alert> : null}

      {queue.loading && !queue.data ? <Loading label="Loading review queue…" /> : null}
      {queue.error ? <ErrorState error={queue.error} onRetry={queue.refetch} /> : null}

      {queue.data ? (
        <div className="split">
          <div className="card">
            <div className="card-header">
              <h2>Queue</h2>
              <span className="faint small">{queue.data.total} finding(s)</span>
            </div>
            {items.length === 0 ? (
              <EmptyState>
                Nothing matches this filter. Findings appear here once an analysis has run and
                been flagged for review.
              </EmptyState>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="finding-row"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                    borderColor: item.id === selectedId ? 'var(--accent)' : 'var(--border)',
                    background: item.id === selectedId ? 'var(--accent-soft)' : 'var(--bg)',
                  }}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="finding-main">
                    <span className="finding-title">
                      {item.clause?.section_id
                        ? `Section ${item.clause.section_id}`
                        : `Clause ${item.clause?.ordinal ?? '?'}`}
                      {item.clause?.heading ? ` — ${item.clause.heading}` : ''}
                    </span>
                    <span className="finding-snippet">
                      {(item.clause?.text || '').slice(0, 130)}
                    </span>
                    <span className="badge-row mt-1">
                      <LabelBadge label={item.effective_label || item.predicted_label} />
                      <ReviewStatusBadge status={item.review_status} />
                      {(item.rights_tags || []).map((tag) => (
                        <span className="badge accent" key={tag}>
                          {RIGHTS_SHORT[tag]}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              ))
            )}
            <Pagination
              page={queue.data.page}
              pages={queue.data.pages}
              total={queue.data.total}
              label="findings"
              onChange={(next) => setParam('page', String(next), { resetPage: false })}
            />
          </div>

          <div>
            {!selected ? (
              <EmptyState>Select a finding to review it.</EmptyState>
            ) : detail.loading && !finding ? (
              <Loading label="Loading finding…" />
            ) : detail.error ? (
              <ErrorState error={detail.error} onRetry={detail.refetch} />
            ) : finding ? (
              <>
                <div className="card">
                  <div className="card-header">
                    <h2>
                      {finding.clause?.section_id
                        ? `Section ${finding.clause.section_id}`
                        : `Clause ${finding.clause?.ordinal}`}
                    </h2>
                    <Link className="btn small" to={`/explorer?finding=${finding.id}`}>
                      Open in explorer
                    </Link>
                  </div>
                  <div className="badge-row mb-2">
                    <LabelBadge label={finding.effective_label || finding.predicted_label} />
                    <ConfidenceBadge value={finding.confidence} />
                    <ReviewStatusBadge status={finding.review_status} />
                    {finding.requires_review ? (
                      <span className="badge warn">needs review</span>
                    ) : null}
                    {(finding.rights_tags || []).map((tag) => (
                      <span className="badge accent" key={tag}>
                        {RIGHTS_SHORT[tag]}
                      </span>
                    ))}
                  </div>

                  <h4>Clause text</h4>
                  <div className="clause-text">{finding.clause?.text || '—'}</div>

                  <h4 className="mt-2">Explanation</h4>
                  <p className="small">{finding.explanation || 'No explanation was produced.'}</p>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Evidence</h3>
                    <span className="faint small">{finding.evidence.length} source(s)</span>
                  </div>
                  {finding.evidence.length === 0 ? (
                    <Alert tone="warn" title="No evidence attached">
                      This finding has no source-linked evidence. Choose “Insufficient evidence” if
                      you cannot verify it.
                    </Alert>
                  ) : (
                    finding.evidence.map((item) => (
                      <div key={item.id} className="card" style={{ boxShadow: 'none' }}>
                        <div className="card-header">
                          <h4>{item.source_title}</h4>
                          {item.is_demonstration ? <DemoBadge label="demo source" /> : null}
                        </div>
                        <p className="small mono">{item.snippet}</p>
                        <dl className="kv">
                          <dt>Section</dt>
                          <dd>{item.source_section || '—'}</dd>
                          <dt>Reference</dt>
                          <dd>{item.source_reference || 'not recorded'}</dd>
                          <dt>Link</dt>
                          <dd>
                            {item.source_url ? (
                              <a href={item.source_url} target="_blank" rel="noreferrer">
                                {item.source_url}
                              </a>
                            ) : (
                              'no source link recorded'
                            )}
                          </dd>
                        </dl>
                      </div>
                    ))
                  )}
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Record a decision</h3>
                  </div>

                  {submitError ? <ErrorState error={submitError} /> : null}

                  <form onSubmit={submit}>
                    <label className="field">
                      <span>Reviewer name</span>
                      <input
                        type="text"
                        value={form.reviewer}
                        maxLength={120}
                        onChange={(event) => setForm({ ...form, reviewer: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      <span>Decision</span>
                      <select
                        value={form.decision}
                        onChange={(event) => setForm({ ...form, decision: event.target.value })}
                      >
                        {Object.entries(DECISION_TEXT).map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </label>

                    {form.decision === 'relabel' ? (
                      <label className="field">
                        <span>Corrected label</span>
                        <select
                          value={form.updated_label}
                          onChange={(event) =>
                            setForm({ ...form, updated_label: event.target.value })
                          }
                        >
                          <option value="">Choose a label…</option>
                          {PREDICTED_LABELS.map((option) => (
                            <option key={option} value={option}>
                              {LABEL_TEXT[option]}
                            </option>
                          ))}
                        </select>
                        <span className="field-hint">
                          Must differ from the current label ({LABEL_TEXT[finding.predicted_label]}).
                        </span>
                      </label>
                    ) : null}

                    <label className="field">
                      <span>
                        Reason {REASON_REQUIRED.has(form.decision) ? '(required)' : '(optional)'}
                      </span>
                      <textarea
                        value={form.reason}
                        maxLength={2000}
                        onChange={(event) => setForm({ ...form, reason: event.target.value })}
                        placeholder="Why this decision? This is stored in the audit log."
                      />
                    </label>

                    <label className="field">
                      <span>Notes (optional)</span>
                      <textarea
                        value={form.notes}
                        maxLength={2000}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        placeholder="Anything else the next reviewer should know."
                      />
                    </label>

                    <label className="field">
                      <span>
                        <input
                          type="checkbox"
                          style={{ width: 'auto', marginRight: 6 }}
                          checked={form.is_usable_for_training}
                          onChange={(event) =>
                            setForm({ ...form, is_usable_for_training: event.target.checked })
                          }
                        />
                        Mark this correction as usable for future training
                      </span>
                      <span className="field-hint">
                        Saved for a future dataset. No model is retrained by this action.
                      </span>
                    </label>

                    <div className="btn-row">
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={submitting || reasonMissing || labelMissing}
                      >
                        {submitting ? 'Saving…' : 'Save decision'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            reason: '',
                            notes: '',
                            updated_label: '',
                            decision: 'confirm',
                          }))
                        }
                        disabled={submitting}
                      >
                        Reset form
                      </button>
                    </div>
                    {reasonMissing ? (
                      <p className="faint small mt-1">
                        A reason is required for this decision type.
                      </p>
                    ) : null}
                  </form>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Decision history</h3>
                    <span className="faint small">{finding.reviews.length} decision(s)</span>
                  </div>
                  {finding.reviews.length === 0 ? (
                    <p className="muted small">No decision has been recorded yet.</p>
                  ) : (
                    <ul className="review-history">
                      {finding.reviews.map((review) => (
                        <li key={review.id}>
                          <div className="badge-row">
                            <span className="badge accent">{DECISION_TEXT[review.decision] || review.decision}</span>
                            <span className="small muted">
                              {review.reviewer} · {new Date(review.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="small">
                            {review.previous_label ? (
                              <>
                                {LABEL_TEXT[review.previous_label] || review.previous_label}
                                {' → '}
                              </>
                            ) : null}
                            {review.updated_label
                              ? LABEL_TEXT[review.updated_label] || review.updated_label
                              : 'no settled label'}
                          </div>
                          {review.reason ? (
                            <div className="small muted">Reason: {review.reason}</div>
                          ) : null}
                          {review.notes ? (
                            <div className="small muted">Notes: {review.notes}</div>
                          ) : null}
                          <div className="faint small">
                            {review.is_usable_for_training
                              ? 'usable for future training'
                              : 'excluded from training data'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
