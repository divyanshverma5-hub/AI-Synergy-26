import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { LABEL_TEXT, PREDICTED_LABELS, RIGHTS_SHORT } from '../constants'
import { ConfidenceBadge, DemoBadge, LabelBadge, ReviewStatusBadge } from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading, Pagination } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const PAGE_SIZE = 10

export default function ClauseExplorer() {
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(params.get('finding') || null)

  const page = Number(params.get('page') || 1)
  const label = params.get('label') || ''
  const search = params.get('q') || ''
  const documentId = params.get('document') || ''
  const analysisId = params.get('analysis') || ''

  const [searchInput, setSearchInput] = useState(search)

  const documents = useAsync(() => api.listDocuments(), [])
  const list = useAsync(
    () =>
      api.listFindings({
        page,
        page_size: PAGE_SIZE,
        label: label || undefined,
        document_id: documentId || undefined,
        analysis_id: analysisId || undefined,
        q: search.trim() || undefined,
      }),
    [page, label, documentId, analysisId, search],
  )

  // The server filters by clause text (`q`), so the page already holds only
  // matching findings. No client-side re-filtering.
  const items = list.data?.items || []

  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

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

  const selected = items.find((finding) => finding.id === selectedId) || null

  const diff = useAsync(
    () =>
      selected
        ? api.getClauseDiff(selected.document_id, selected.clause_id).catch(() => null)
        : Promise.resolve(null),
    [selected?.id],
    { immediate: Boolean(selected) },
  )

  return (
    <>
      <PageHeader title="Clause explorer">
        <p>
          Compare a new clause against the earlier provision it was matched with. Removed text is
          struck through on the earlier provision; added text is highlighted on the new clause.
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
            <span>Predicted label</span>
            <select value={label} onChange={(event) => setParam('label', event.target.value)}>
              <option value="">All labels</option>
              {PREDICTED_LABELS.map((option) => (
                <option key={option} value={option}>
                  {LABEL_TEXT[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search clause text</span>
            <input
              type="search"
              value={searchInput}
              placeholder="e.g. appeal, privacy"
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setParam('q', searchInput)
              }}
            />
          </label>
          <button type="button" className="btn small" onClick={() => setParam('q', searchInput)}>
            Search
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setSearchInput('')
              setParams({})
              setSelectedId(null)
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {list.loading && !list.data ? <Loading label="Loading findings…" /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={list.refetch} /> : null}

      {list.data ? (
        <div className="split">
          <div className="card">
            <div className="card-header">
              <h2>Findings</h2>
              <span className="faint small">{list.data.total} total</span>
            </div>
            {items.length === 0 ? (
              <EmptyState>
                No findings match. {search ? 'Try clearing the search text.' : 'Adjust the filters.'}
              </EmptyState>
            ) : (
              items.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  className="finding-row"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                    borderColor:
                      finding.id === selectedId ? 'var(--accent)' : 'var(--border)',
                    background:
                      finding.id === selectedId ? 'var(--accent-soft)' : 'var(--bg)',
                  }}
                  onClick={() => setSelectedId(finding.id)}
                >
                  <span className="finding-main">
                    <span className="finding-title">
                      {finding.clause?.section_id
                        ? `Section ${finding.clause.section_id}`
                        : `Clause ${finding.clause?.ordinal ?? '?'}`}
                      {finding.clause?.heading ? ` — ${finding.clause.heading}` : ''}
                    </span>
                    <span className="finding-snippet">
                      {(finding.clause?.text || '').slice(0, 140)}
                    </span>
                    <span className="badge-row mt-1">
                      <LabelBadge label={finding.effective_label || finding.predicted_label} />
                      <ReviewStatusBadge status={finding.review_status} />
                      {finding.requires_review ? (
                        <span className="badge warn">needs review</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))
            )}
            <Pagination
              page={list.data.page}
              pages={list.data.pages}
              total={list.data.total}
              label="findings"
              onChange={(next) => setParam('page', String(next), { resetPage: false })}
            />
          </div>

          <div>
            {!selected ? (
              <EmptyState>Select a finding to compare it with its matched provision.</EmptyState>
            ) : (
              <>
                <div className="card">
                  <div className="card-header">
                    <h2>
                      {selected.clause?.section_id
                        ? `Section ${selected.clause.section_id}`
                        : `Clause ${selected.clause?.ordinal}`}
                    </h2>
                    <Link className="btn small" to={`/review?finding=${selected.id}`}>
                      Review
                    </Link>
                  </div>
                  <div className="badge-row mb-2">
                    <LabelBadge
                      label={selected.effective_label || selected.predicted_label}
                    />
                    <ConfidenceBadge value={selected.confidence} />
                    <ReviewStatusBadge status={selected.review_status} />
                    {(selected.rights_tags || []).map((tag) => (
                      <span className="badge accent" key={tag}>
                        {RIGHTS_SHORT[tag]}
                      </span>
                    ))}
                    {selected.evidence_sufficient ? null : (
                      <span className="badge warn">insufficient evidence</span>
                    )}
                  </div>
                  {selected.explanation ? (
                    <p className="small">{selected.explanation}</p>
                  ) : null}
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Side-by-side comparison</h3>
                    {diff.data?.is_demonstration ? <DemoBadge /> : null}
                  </div>
                  {diff.loading ? <Loading label="Loading comparison…" /> : null}
                  {!diff.loading && !diff.data ? (
                    <Alert tone="info" title="No matched provision">
                      No earlier provision is linked to this finding, so a comparison is not
                      available. The finding is flagged for human review instead.
                    </Alert>
                  ) : null}
                  {diff.data ? (
                    <>
                      <div className="diff-legend">
                        <span>
                          <span className="swatch removed" /> removed from the earlier provision
                        </span>
                        <span>
                          <span className="swatch added" /> added by the new clause
                        </span>
                        <span className="muted">
                          text similarity {(diff.data.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="split">
                        <div>
                          <h4>Earlier provision</h4>
                          <div className="small muted">
                            {diff.data.provision.act_title} · {diff.data.provision.section_id}
                          </div>
                          <div className="provision-text mt-1">
                            {diff.data.segments.old.map((segment, index) =>
                              segment.type === 'removed' ? (
                                <mark className="removed" key={index}>
                                  {segment.text}
                                </mark>
                              ) : (
                                <span key={index}>{segment.text}</span>
                              ),
                            )}
                          </div>
                          <dl className="kv mt-1">
                            <dt>Legal status</dt>
                            <dd>{diff.data.provision.legal_status || 'not recorded'}</dd>
                            <dt>Date</dt>
                            <dd>{diff.data.provision.document_date || 'not recorded'}</dd>
                            <dt>Source</dt>
                            <dd>
                              {diff.data.provision.source_url ? (
                                <a
                                  href={diff.data.provision.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {diff.data.provision.source_url}
                                </a>
                              ) : (
                                diff.data.provision.source_reference || 'not recorded'
                              )}
                            </dd>
                          </dl>
                        </div>
                        <div>
                          <h4>New clause</h4>
                          <div className="small muted">
                            {selected.document_title || 'Uploaded bill'}
                            {selected.clause?.section_id
                              ? ` · Section ${selected.clause.section_id}`
                              : ''}
                          </div>
                          <div className="provision-text mt-1">
                            {diff.data.segments.new.map((segment, index) =>
                              segment.type === 'added' ? (
                                <mark className="added" key={index}>
                                  {segment.text}
                                </mark>
                              ) : (
                                <span key={index}>{segment.text}</span>
                              ),
                            )}
                          </div>
                          <dl className="kv mt-1">
                            <dt>Page</dt>
                            <dd>{selected.clause?.page_number ?? 'not recorded'}</dd>
                            <dt>Ordinal</dt>
                            <dd>{selected.clause?.ordinal ?? '—'}</dd>
                            <dt>Characters</dt>
                            <dd className="mono">
                              {selected.clause
                                ? `${selected.clause.char_start}–${selected.clause.char_end}`
                                : '—'}
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Evidence</h3>
                    <span className="faint small">{selected.evidence.length} source(s)</span>
                  </div>
                  {selected.evidence.length === 0 ? (
                    <Alert tone="warn" title="No evidence attached">
                      No source-linked evidence was produced for this finding. It is flagged for
                      review rather than given a conclusion.
                    </Alert>
                  ) : (
                    selected.evidence.map((item) => (
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
                          <dt>Retrieval score</dt>
                          <dd>{item.retrieval_score ?? 'not available'}</dd>
                        </dl>
                      </div>
                    ))
                  )}
                </div>

                <div className="card">
                  <h3>Implications</h3>
                  {selected.implications?.sufficient_evidence === false ? (
                    <Alert tone="warn" title="Insufficient evidence">
                      {selected.implications.message ||
                        'There is insufficient evidence to determine the implications of this clause.'}
                    </Alert>
                  ) : (
                    <>
                      <p className="muted small">{selected.implications?.message}</p>
                      <div className="grid cols-3">
                        <div>
                          <h4>Possible benefits</h4>
                          <ul className="small">
                            {(selected.implications?.benefits || []).length === 0 ? (
                              <li className="muted">None identified.</li>
                            ) : (
                              selected.implications.benefits.map((item) => <li key={item}>{item}</li>)
                            )}
                          </ul>
                        </div>
                        <div>
                          <h4>Possible drawbacks</h4>
                          <ul className="small">
                            {(selected.implications?.drawbacks || []).length === 0 ? (
                              <li className="muted">None identified.</li>
                            ) : (
                              selected.implications.drawbacks.map((item) => <li key={item}>{item}</li>)
                            )}
                          </ul>
                        </div>
                        <div>
                          <h4>Affected interests</h4>
                          <ul className="small">
                            {(selected.implications?.affected_interests || []).length === 0 ? (
                              <li className="muted">None identified.</li>
                            ) : (
                              selected.implications.affected_interests.map((item) => (
                                <li key={item}>{item}</li>
                              ))
                            )}
                          </ul>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
