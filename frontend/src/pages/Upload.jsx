import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Alert, ErrorState } from '../components/Feedback'
import { PageHeader } from '../components/Layout'

const MAX_MB = 20

export default function Upload() {
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [file, setFile] = useState(null)
  const [meta, setMeta] = useState({
    title: '',
    version_label: '',
    document_date: '',
    legal_status: '',
    source_reference: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [uploaded, setUploaded] = useState(null)
  const [autoAnalyse, setAutoAnalyse] = useState(true)

  const onFileChange = useCallback((event) => {
    const chosen = event.target.files?.[0] || null
    setError(null)
    setUploaded(null)
    if (chosen && !chosen.name.toLowerCase().endsWith('.pdf')) {
      setFile(null)
      setError('Only PDF files are accepted. Choose a file ending in .pdf.')
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    if (chosen && chosen.size > MAX_MB * 1024 * 1024) {
      setFile(null)
      setError(`File is larger than the ${MAX_MB} MB limit.`)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setFile(chosen)
  }, [])

  const submit = useCallback(
    async (event) => {
      event.preventDefault()
      setError(null)
      if (!file) {
        setError('Choose a PDF file before uploading.')
        return
      }
      const form = new FormData()
      form.append('file', file)
      if (meta.title.trim()) form.append('title', meta.title.trim())
      if (meta.version_label.trim()) form.append('version_label', meta.version_label.trim())
      if (meta.document_date.trim()) form.append('document_date', meta.document_date.trim())
      if (meta.legal_status.trim()) form.append('legal_status', meta.legal_status.trim())
      if (meta.source_reference.trim()) form.append('source_reference', meta.source_reference.trim())

      setBusy(true)
      try {
        const document = await api.uploadDocument(form)
        setUploaded(document)
        setFile(null)
        if (fileInput.current) fileInput.current.value = ''
        if (autoAnalyse) {
          const analysis = await api.createAnalysis({ document_id: document.id })
          navigate(`/analyses/${analysis.id}`)
          return
        }
      } catch (cause) {
        setError(cause.message)
      } finally {
        setBusy(false)
      }
    },
    [file, meta, autoAnalyse, navigate],
  )

  const runAnalysis = useCallback(
    async (documentId) => {
      setError(null)
      setBusy(true)
      try {
        const analysis = await api.createAnalysis({ document_id: documentId })
        navigate(`/analyses/${analysis.id}`)
      } catch (cause) {
        setError(cause.message)
      } finally {
        setBusy(false)
      }
    },
    [navigate],
  )

  return (
    <>
      <PageHeader title="Analyse a Bill">
        <p>
          Upload a proposed bill or draft law as a PDF. We read the text, split it into clauses and
          check each clause against existing provisions. You can watch progress and read the
          findings straight after.
        </p>
      </PageHeader>

      {error ? <ErrorState error={error} /> : null}

      {uploaded ? (
        <Alert tone="ok" title="Upload complete">
          <strong>{uploaded.title}</strong> extracted {uploaded.clause_count} clause
          {uploaded.clause_count === 1 ? '' : 's'} from {uploaded.page_count} page
          {uploaded.page_count === 1 ? '' : 's'}.{' '}
          <Link to={`/documents/${uploaded.id}`}>Open document</Link>{' '}
          {!autoAnalyse ? (
            <>
              or{' '}
              <button
                type="button"
                className="btn small"
                onClick={() => runAnalysis(uploaded.id)}
                disabled={busy}
              >
                run analysis now
              </button>
            </>
          ) : null}
        </Alert>
      ) : null}

      <form className="card upload-card" onSubmit={submit}>
          <h2>New document</h2>
          <label className="field">
            <span>PDF file</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileChange}
              aria-describedby="file-hint"
            />
            <span className="field-hint" id="file-hint">
              PDF only, up to {MAX_MB} MB. Scanned images without a text layer cannot be read.
            </span>
          </label>

          <label className="field">
            <span>Title (optional)</span>
            <input
              type="text"
              value={meta.title}
              maxLength={200}
              placeholder="Defaults to the file name"
              onChange={(event) => setMeta({ ...meta, title: event.target.value })}
            />
          </label>

          <div className="grid cols-2">
            <label className="field">
              <span>Version label (optional)</span>
              <input
                type="text"
                value={meta.version_label}
                maxLength={60}
                placeholder="e.g. 2.0 draft"
                onChange={(event) => setMeta({ ...meta, version_label: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Document date (optional)</span>
              <input
                type="text"
                value={meta.document_date}
                maxLength={60}
                placeholder="e.g. 2025-03-14"
                onChange={(event) => setMeta({ ...meta, document_date: event.target.value })}
              />
            </label>
          </div>

          <label className="field">
            <span>Legal status (optional)</span>
            <input
              type="text"
              value={meta.legal_status}
              maxLength={120}
              placeholder="e.g. proposed, in force, lapsed"
              onChange={(event) => setMeta({ ...meta, legal_status: event.target.value })}
            />
          </label>

          <label className="field">
            <span>Source reference (optional)</span>
            <input
              type="text"
              value={meta.source_reference}
              maxLength={300}
              placeholder="Where this document came from"
              onChange={(event) => setMeta({ ...meta, source_reference: event.target.value })}
            />
          </label>

          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={autoAnalyse}
                onChange={(event) => setAutoAnalyse(event.target.checked)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              Start analysis immediately after upload
            </span>
          </label>

          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={busy || !file}>
              {busy ? 'Working…' : 'Upload PDF'}
            </button>
            {file ? (
              <span className="small muted">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            ) : null}
          </div>
      </form>
    </>
  )
}
