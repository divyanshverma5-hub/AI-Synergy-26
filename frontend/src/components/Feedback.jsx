import { DISCLAIMER } from '../constants'

export function Alert({ tone = 'info', title, children }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  )
}

export function DemoNotice({ children }) {
  return (
    <Alert tone="info" title="Demonstration data">
      {children ||
        'These results were produced by the mock analysis provider using seeded fictional material. They are not real AI analysis and are not legal advice.'}
    </Alert>
  )
}

export function Disclaimer() {
  return <p className="faint small mt-2">{DISCLAIMER}</p>
}

export function EmptyState({ children }) {
  return <div className="empty">{children}</div>
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading" role="status">
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const message =
    typeof error === 'string' ? error : error?.message || 'Something went wrong.'
  return (
    <Alert tone="danger" title="Request failed">
      {message}
      {onRetry ? (
        <div className="mt-1">
          <button type="button" className="btn small" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </Alert>
  )
}

export function Pagination({ page, pages, total, onChange, label = 'items' }) {
  if (pages <= 1) {
    return (
      <div className="pagination">
        <span>
          {total} {label}
        </span>
      </div>
    )
  }
  return (
    <div className="pagination">
      <button
        type="button"
        className="btn small"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>
      <span>
        Page {page} of {pages} · {total} {label}
      </span>
      <button
        type="button"
        className="btn small"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
      >
        Next
      </button>
    </div>
  )
}
