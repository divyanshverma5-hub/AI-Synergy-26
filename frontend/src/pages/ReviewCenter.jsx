import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { DECISION_TEXT, LABEL_TEXT, REVIEW_STATUSES, REVIEW_STATUS_TEXT, RIGHTS_SHORT } from '../constants'
import {
  ConfidenceBadge,
  DemoBadge,
  LabelBadge,
  ReviewStatusBadge,
} from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading, Pagination } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { ReviewForm } from '../components/ReviewForm'
import { useAsync } from '../components/hooks'

const PAGE_SIZE = 10

export default function ReviewCenter() {
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(params.get('finding') || null)

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
                  <ReviewForm
                    key={finding.id}
                    finding={finding}
                    onSaved={async () => {
                      await Promise.all([detail.refetch(), queue.refetch()])
                    }}
                  />
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
