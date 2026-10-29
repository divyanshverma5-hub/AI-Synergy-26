import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { DemoBadge } from '../components/Badges'
import { Alert, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

export default function DocumentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showFullText, setShowFullText] = useState(false)

  const document = useAsync(() => api.getDocument(id), [id])
  const clauses = useAsync(() => api.getClauses(id), [id])
  const analyses = useAsync(() => api.listAnalyses({ document_id: id }), [id])

  const runAnalysis = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const analysis = await api.createAnalysis({ document_id: id })
      navigate(`/analyses/${analysis.id}`)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [id, navigate])

  if (document.loading && !document.data) return <Loading label="Loading document…" />
  if (document.error) {
    return (
      <>
        <PageHeader title="Document" />
        <ErrorState error={document.error} onRetry={document.refetch} />
        <Link to="/upload">← Back to upload</Link>
      </>
    )
  }

  const doc = document.data
  if (!doc) return null

  return (
    <>
      <PageHeader title={doc.title}>
        <p>
          <Link to="/upload">Upload</Link> · {doc.filename} · {doc.page_count} page
          {doc.page_count === 1 ? '' : 's'} · {(doc.file_size / 1024).toFixed(0)} KB
        </p>
      </PageHeader>

      {error ? <ErrorState error={error} /> : null}

      {doc.is_demonstration ? (
        <Alert tone="info" title="Demonstration document">
          This is a generated fictional bill used to demonstrate the workflow. It is not real
          legislation and its findings are simulated.
        </Alert>
      ) : null}

      {doc.extraction_error ? (
        <Alert tone="danger" title="Text extraction failed">
          {doc.extraction_error}
        </Alert>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2>Document metadata</h2>
          <button type="button" className="btn small" onClick={document.refetch}>
            Refresh
          </button>
        </div>
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            <span className="badge neutral">{doc.status}</span>{' '}
            {doc.is_demonstration ? <DemoBadge /> : null}
          </dd>
          <dt>Version label</dt>
          <dd>{doc.version_label || 'not recorded'}</dd>
          <dt>Document date</dt>
          <dd>{doc.document_date || 'not recorded'}</dd>
          <dt>Legal status</dt>
          <dd>{doc.legal_status || 'not recorded'}</dd>
          <dt>Source reference</dt>
          <dd>{doc.source_reference || 'not recorded'}</dd>
          <dt>Uploaded</dt>
          <dd>{new Date(doc.created_at).toLocaleString()}</dd>
          <dt>Clauses</dt>
          <dd>{doc.clause_count}</dd>
          <dt>Analyses</dt>
          <dd>{doc.analysis_count}</dd>
        </dl>
        <div className="btn-row mt-2">
          <button
            type="button"
            className="btn primary"
            onClick={runAnalysis}
            disabled={busy || doc.clause_count === 0}
          >
            {busy ? 'Starting…' : 'Run analysis'}
          </button>
          <Link className="btn" to={`/health?document=${doc.id}`}>
            Bill health summary
          </Link>
          <Link className="btn" to={`/explorer?document=${doc.id}`}>
            Clause explorer
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => setShowFullText((value) => !value)}
          >
            {showFullText ? 'Hide extracted text' : 'Show extracted text'}
          </button>
        </div>
        {showFullText ? (
          <div className="clause-text mt-2" aria-label="Extracted document text">
            {doc.text || 'No text was extracted.'}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Analysis jobs</h2>
          <button type="button" className="btn small" onClick={analyses.refetch}>
            Refresh
          </button>
        </div>
        {analyses.loading && !analyses.data ? <Loading /> : null}
        {analyses.error ? <ErrorState error={analyses.error} onRetry={analyses.refetch} /> : null}
        {analyses.data && analyses.data.length === 0 ? (
          <p className="muted">
            No analysis has been run for this document yet. Use “Run analysis” above.
          </p>
        ) : null}
        {analyses.data && analyses.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Findings</th>
                  <th>Provider</th>
                  <th>Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {analyses.data.map((analysis) => (
                  <tr key={analysis.id}>
                    <td className="mono">{analysis.id.slice(0, 8)}</td>
                    <td>
                      <span className="badge neutral">{analysis.status}</span>
                    </td>
                    <td>{analysis.progress}%</td>
                    <td>{analysis.finding_count}</td>
                    <td className="small">{analysis.provider}</td>
                    <td className="small">
                      {analysis.started_at
                        ? new Date(analysis.started_at).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <Link to={`/analyses/${analysis.id}`} className="small">
                        Results
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Clauses</h2>
          <button type="button" className="btn small" onClick={clauses.refetch}>
            Refresh
          </button>
        </div>
        {clauses.loading && !clauses.data ? <Loading /> : null}
        {clauses.error ? <ErrorState error={clauses.error} onRetry={clauses.refetch} /> : null}
        {clauses.data && clauses.data.length === 0 ? (
          <p className="muted">No clauses were extracted.</p>
        ) : null}
        {clauses.data
          ? clauses.data.map((clause) => (
              <div className="card" key={clause.id} style={{ boxShadow: 'none' }}>
                <div className="card-header">
                  <h3>
                    {clause.section_id ? `Section ${clause.section_id}` : `Clause ${clause.ordinal}`}
                    {clause.heading ? ` — ${clause.heading}` : ''}
                  </h3>
                  <span className="faint small">
                    ordinal {clause.ordinal}
                    {clause.page_number ? ` · page ${clause.page_number}` : ''}
                  </span>
                </div>
                <div className="clause-text">{clause.text}</div>
              </div>
            ))
          : null}
      </div>
    </>
  )
}
