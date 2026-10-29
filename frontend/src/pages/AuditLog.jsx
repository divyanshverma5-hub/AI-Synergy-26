import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Alert, EmptyState, ErrorState, Loading, Pagination } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const PAGE_SIZE = 20

const ENTITY_TYPES = ['document', 'analysis', 'finding', 'model_metrics']
const ACTIONS = [
  'document.uploaded',
  'document.extraction_failed',
  'analysis.created',
  'analysis.processing',
  'analysis.findings_persisted',
  'analysis.completed',
  'analysis.failed',
  'review.confirm',
  'review.reject',
  'review.relabel',
  'review.insufficient_evidence',
  'metrics.imported',
]

export default function AuditLog() {
  const [params, setParams] = useSearchParams()
  const [entityId, setEntityId] = useState(params.get('entity_id') || '')

  const page = Number(params.get('page') || 1)
  const entityType = params.get('entity_type') || ''
  const action = params.get('action') || ''
  const actor = params.get('actor') || ''
  const idFilter = params.get('entity_id') || ''

  const log = useAsync(
    () =>
      api.auditLog({
        page,
        page_size: PAGE_SIZE,
        entity_type: entityType || undefined,
        action: action || undefined,
        actor: actor || undefined,
        entity_id: idFilter || undefined,
      }),
    [page, entityType, action, actor, idFilter],
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

  return (
    <>
      <PageHeader title="Audit log">
        <p>
          An append-only record of uploads, analysis runs and reviewer decisions, including
          previous and updated values, reasons and timestamps. Historical decisions are preserved
          rather than overwritten.
        </p>
      </PageHeader>

      <div className="card">
        <div className="filters">
          <label className="field">
            <span>Entity type</span>
            <select
              value={entityType}
              onChange={(event) => setParam('entity_type', event.target.value)}
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Action</span>
            <select value={action} onChange={(event) => setParam('action', event.target.value)}>
              <option value="">All actions</option>
              {ACTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Actor</span>
            <input
              type="search"
              value={actor}
              placeholder="e.g. reviewer"
              onChange={(event) => setParam('actor', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Entity ID</span>
            <input
              type="search"
              value={entityId}
              placeholder="e.g. finding id"
              onChange={(event) => setEntityId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setParam('entity_id', entityId)
              }}
            />
          </label>
          <button type="button" className="btn small" onClick={() => setParam('entity_id', entityId)}>
            Filter by ID
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setEntityId('')
              setParams({})
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {log.loading && !log.data ? <Loading label="Loading audit log…" /> : null}
      {log.error ? <ErrorState error={log.error} onRetry={log.refetch} /> : null}

      {log.data ? (
        <div className="card">
          <div className="card-header">
            <h2>Entries</h2>
            <span className="faint small">{log.data.total} entry(ies)</span>
          </div>

          {log.data.items.length === 0 ? (
            <EmptyState>No audit entries match these filters.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Change</th>
                    <th>Reason / context</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="nowrap small">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="small">{entry.actor}</td>
                      <td>
                        <span className="badge neutral">{entry.action}</span>
                      </td>
                      <td className="small">
                        {entry.entity_type}
                        <div className="mono faint">{entry.entity_id.slice(0, 10)}</div>
                        {entry.entity_type === 'finding' ? (
                          <Link className="small" to={`/review?finding=${entry.entity_id}`}>
                            open
                          </Link>
                        ) : null}
                        {entry.entity_type === 'analysis' ? (
                          <Link className="small" to={`/analyses/${entry.entity_id}`}>
                            open
                          </Link>
                        ) : null}
                        {entry.entity_type === 'document' ? (
                          <Link className="small" to={`/documents/${entry.entity_id}`}>
                            open
                          </Link>
                        ) : null}
                      </td>
                      <td>
                        <div className="audit-detail">
                          {entry.previous_value ? <div>from: {entry.previous_value}</div> : null}
                          {entry.new_value ? <div>to: {entry.new_value}</div> : null}
                        </div>
                      </td>
                      <td>
                        <div className="audit-detail">
                          {entry.reason ? <div>{entry.reason}</div> : null}
                          {entry.context && Object.keys(entry.context).length > 0 ? (
                            <div>{JSON.stringify(entry.context)}</div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={log.data.page}
            pages={log.data.pages}
            total={log.data.total}
            label="entries"
            onChange={(next) => setParam('page', String(next), { resetPage: false })}
          />
        </div>
      ) : null}

      <Alert tone="info" title="Immutability">
        Audit entries are never edited or deleted. Reviewer decisions are stored as new rows, so
        the full history of a finding stays available.
      </Alert>
    </>
  )
}
