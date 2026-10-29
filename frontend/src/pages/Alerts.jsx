import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { RIGHTS_ARTICLES, RIGHTS_SHORT, RIGHTS_TEXT } from '../constants'
import { LabelBadge, ReviewStatusBadge } from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading, Pagination } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const PAGE_SIZE = 10
const MODES = [
  { id: 'safeguards', label: 'Removed or weakened safeguards' },
  { id: 'rights', label: 'Rights-relevant clauses' },
]

export default function Alerts() {
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState(params.get('mode') || 'safeguards')

  const rightsFilter = params.get('rights') || ''
  const page = Number(params.get('page') || 1)
  const documentId = params.get('document') || ''

  const documents = useAsync(() => api.listDocuments(), [])

  const safeguards = useAsync(
    () =>
      api.listFindings({
        page,
        page_size: PAGE_SIZE,
        label: 'removes_safeguard',
        document_id: documentId || undefined,
      }),
    [page, documentId, mode],
    { immediate: mode === 'safeguards' },
  )

  const rights = useAsync(
    () =>
      api.listFindings({
        page,
        page_size: PAGE_SIZE,
        rights_tag: rightsFilter || undefined,
        document_id: documentId || undefined,
      }),
    [page, rightsFilter, documentId, mode],
    { immediate: mode === 'rights' },
  )

  const active = mode === 'safeguards' ? safeguards : rights
  const items = useMemo(() => active.data?.items || [], [active.data])

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

  const switchMode = useCallback(
    (next) => {
      setMode(next)
      const search = new URLSearchParams(params)
      search.set('mode', next)
      search.delete('page')
      if (next === 'safeguards') search.delete('rights')
      setParams(search)
    },
    [params, setParams],
  )

  const rightsCounts = rights.data
    ? RIGHTS_ARTICLES.reduce((accumulator, article) => {
        accumulator[article] = rights.data.items.filter((finding) =>
          (finding.rights_tags || []).includes(article),
        ).length
        return accumulator
      }, {})
    : {}

  return (
    <>
      <PageHeader title="Safeguard and rights alerts">
        <p>
          Clauses that appear to weaken or remove a safeguard, exemption, appeal right or
          protection, and clauses tagged as potentially relevant to Articles 14, 19 and 21 of the
          Constitution. Rights tags route clauses to mandatory human review. They are not legal
          conclusions.
        </p>
      </PageHeader>

      <div className="tabs" role="tablist">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={mode === entry.id}
            onClick={() => switchMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

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

          {mode === 'rights' ? (
            <label className="field">
              <span>Article</span>
              <select value={rightsFilter} onChange={(e) => setParam('rights', e.target.value)}>
                <option value="">All articles</option>
                {RIGHTS_ARTICLES.map((article) => (
                  <option key={article} value={article}>
                    {RIGHTS_TEXT[article]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            className="btn small"
            onClick={() => {
              const next = new URLSearchParams()
              next.set('mode', mode)
              setParams(next)
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {mode === 'rights' ? (
        <Alert tone="info" title="Rights tags are review triggers">
          A tag means the clause uses language that may engage an article. It does not mean the
          clause violates the Constitution. Every tagged clause must be reviewed by a person.
        </Alert>
      ) : null}

      {mode === 'safeguards' ? (
        <Alert tone="warn" title="Safeguard alerts">
          These clauses are predicted to remove or weaken an existing protection. Review the
          evidence before relying on the prediction.
        </Alert>
      ) : null}

      {active.loading && !active.data ? <Loading label="Loading alerts…" /> : null}
      {active.error ? <ErrorState error={active.error} onRetry={active.refetch} /> : null}

      {active.data ? (
        <div className="card">
          <div className="card-header">
            <h2>{mode === 'safeguards' ? 'Safeguard alerts' : 'Rights-relevant clauses'}</h2>
            <span className="faint small">{active.data.total} finding(s)</span>
          </div>

          {mode === 'rights' && rightsFilter === '' && Object.keys(rightsCounts).length > 0 ? (
            <div className="badge-row mb-2">
              {RIGHTS_ARTICLES.map((article) => (
                <button
                  key={article}
                  type="button"
                  className="badge accent"
                  style={{ cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => setParam('rights', article)}
                >
                  {RIGHTS_SHORT[article]}: {rightsCounts[article] ?? 0} on this page
                </button>
              ))}
            </div>
          ) : null}

          {items.length === 0 ? (
            <EmptyState>
              No findings match this view. {documentId ? 'Try clearing the document filter.' : 'Run an analysis first if none has been completed.'}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Clause</th>
                    <th>Label</th>
                    <th>Review status</th>
                    <th>Rights</th>
                    <th>Evidence</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((finding) => (
                    <tr key={finding.id}>
                      <td>
                        <div className="finding-title">
                          {finding.clause?.section_id
                            ? `Section ${finding.clause.section_id}`
                            : `Clause ${finding.clause?.ordinal ?? '?'}`}
                          {finding.clause?.heading ? ` — ${finding.clause.heading}` : ''}
                        </div>
                        <div className="finding-snippet">
                          {(finding.clause?.text || '').slice(0, 150)}
                        </div>
                        <div className="faint small">{finding.document_title}</div>
                      </td>
                      <td>
                        <LabelBadge label={finding.effective_label || finding.predicted_label} />
                      </td>
                      <td>
                        <ReviewStatusBadge status={finding.review_status} />
                      </td>
                      <td className="small">
                        {(finding.rights_tags || []).length === 0
                          ? '—'
                          : finding.rights_tags.map((tag) => RIGHTS_SHORT[tag]).join(', ')}
                      </td>
                      <td className="small">
                        {finding.evidence.length} source(s)
                        {finding.evidence_sufficient ? '' : ' · insufficient'}
                      </td>
                      <td className="nowrap">
                        <Link className="btn small" to={`/review?finding=${finding.id}`}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={active.data.page}
            pages={active.data.pages}
            total={active.data.total}
            label="findings"
            onChange={(next) => setParam('page', String(next), { resetPage: false })}
          />
        </div>
      ) : null}
    </>
  )
}
