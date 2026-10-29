import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { LABEL_TEXT, PREDICTED_LABELS } from '../constants'
import { LabelBadge } from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading, Pagination } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const PAGE_SIZE = 10

export default function Implications() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') || 1)
  const documentId = params.get('document') || ''
  // Default to showing everything: hiding insufficient-evidence findings by
  // default would bury exactly the clauses a reviewer most needs to see.
  const sufficiency = params.get('evidence') || 'all'

  const documents = useAsync(() => api.listDocuments(), [])

  const list = useAsync(
    () =>
      api.listFindings({
        page,
        page_size: PAGE_SIZE,
        document_id: documentId || undefined,
      }),
    [page, documentId],
  )

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

  const items = useMemo(() => {
    const rows = list.data?.items || []
    if (sufficiency === 'insufficient') {
      return rows.filter((finding) => finding.implications?.sufficient_evidence === false)
    }
    if (sufficiency === 'sufficient') {
      return rows.filter((finding) => finding.implications?.sufficient_evidence !== false)
    }
    return rows
  }, [list.data, sufficiency])

  return (
    <>
      <PageHeader title="Implications">
        <p>
          Possible benefits, drawbacks and affected interests, shown only where the finding is
          supported by evidence. Where evidence is missing or insufficient the page says so
          instead of drawing a conclusion.
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
            <span>Evidence</span>
            <select value={sufficiency} onChange={(e) => setParam('evidence', e.target.value)}>
              <option value="sufficient">Supported by evidence</option>
              <option value="insufficient">Insufficient evidence</option>
              <option value="all">All findings on this page</option>
            </select>
          </label>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setParams({})
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {list.loading && !list.data ? <Loading label="Loading implications…" /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={list.refetch} /> : null}

      {list.data ? (
        <div className="card">
          <div className="card-header">
            <h2>Findings</h2>
            <span className="faint small">
              {items.length} of {list.data.total} on this page
            </span>
          </div>

          {items.length === 0 ? (
            <EmptyState>
              No findings match this filter on the current page.
              {list.data.pages > 1 ? ' Try another page.' : ''}
            </EmptyState>
          ) : (
            items.map((finding) => {
              const implications = finding.implications || {}
              const insufficient = implications.sufficient_evidence === false
              return (
                <div className="card" key={finding.id} style={{ boxShadow: 'none' }}>
                  <div className="card-header">
                    <h3>
                      {finding.clause?.section_id
                        ? `Section ${finding.clause.section_id}`
                        : `Clause ${finding.clause?.ordinal ?? '?'}`}
                      {finding.clause?.heading ? ` — ${finding.clause.heading}` : ''}
                    </h3>
                    <LabelBadge label={finding.effective_label || finding.predicted_label} />
                  </div>
                  <p className="finding-snippet">{(finding.clause?.text || '').slice(0, 220)}</p>

                  {insufficient ? (
                    <Alert tone="warn" title="Insufficient evidence">
                      {implications.message ||
                        'There is insufficient evidence to determine the implications of this clause.'}
                    </Alert>
                  ) : (
                    <>
                      {implications.message ? (
                        <p className="muted small">{implications.message}</p>
                      ) : null}
                      <div className="grid cols-3">
                        <div>
                          <h4>Possible benefits</h4>
                          <ul className="small">
                            {(implications.benefits || []).length === 0 ? (
                              <li className="muted">None identified from the available evidence.</li>
                            ) : (
                              implications.benefits.map((entry) => <li key={entry}>{entry}</li>)
                            )}
                          </ul>
                        </div>
                        <div>
                          <h4>Possible drawbacks</h4>
                          <ul className="small">
                            {(implications.drawbacks || []).length === 0 ? (
                              <li className="muted">None identified from the available evidence.</li>
                            ) : (
                              implications.drawbacks.map((entry) => <li key={entry}>{entry}</li>)
                            )}
                          </ul>
                        </div>
                        <div>
                          <h4>Affected interests</h4>
                          <ul className="small">
                            {(implications.affected_interests || []).length === 0 ? (
                              <li className="muted">None identified from the available evidence.</li>
                            ) : (
                              implications.affected_interests.map((entry) => (
                                <li key={entry}>{entry}</li>
                              ))
                            )}
                          </ul>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="btn-row mt-1">
                    <Link className="btn small" to={`/explorer?finding=${finding.id}`}>
                      Evidence
                    </Link>
                    <Link className="btn small" to={`/review?finding=${finding.id}`}>
                      Review
                    </Link>
                  </div>
                </div>
              )
            })
          )}

          <Pagination
            page={list.data.page}
            pages={list.data.pages}
            total={list.data.total}
            label="findings"
            onChange={(next) => setParam('page', String(next), { resetPage: false })}
          />
        </div>
      ) : null}
    </>
  )
}
