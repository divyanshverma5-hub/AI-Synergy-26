/**
 * Thin API client. Every request the UI makes goes through here, so there is a
 * single place that knows the backend contract and a single place that turns
 * failures into readable messages.
 */

const BASE = import.meta.env.VITE_API_BASE || '/api'

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, options)
  } catch (cause) {
    throw new ApiError(
      'Could not reach the backend. Check that the API server is running.',
      0,
      String(cause),
    )
  }

  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { detail: text }
    }
  }

  if (!response.ok) {
    throw new ApiError(detailMessage(body, response.status), response.status, body)
  }
  return body
}

function detailMessage(body, status) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors arrive as a list of {loc, msg}.
    return detail
      .map((item) =>
        item?.msg ? `${item.loc?.slice(1).join('.') || 'field'}: ${item.msg}` : String(item),
      )
      .join('; ')
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail)
  return `Request failed with status ${status}.`
}

const query = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const string = search.toString()
  return string ? `?${string}` : ''
}

export const api = {
  health: () => request('/health'),

  // Documents
  listDocuments: (params) => request(`/documents${query(params)}`),
  getDocument: (id) => request(`/documents/${id}`),
  getClauses: (id) => request(`/documents/${id}/clauses`),
  getClauseDiff: (documentId, clauseId) =>
    request(`/documents/${documentId}/clauses/${clauseId}/diff`),
  uploadDocument: (formData) => request('/documents', { method: 'POST', body: formData }),

  // Analyses
  listAnalyses: (params) => request(`/analyses${query(params)}`),
  createAnalysis: (payload) =>
    request('/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  getAnalysis: (id) => request(`/analyses/${id}`),
  getResults: (id) => request(`/analyses/${id}/results`),

  // Findings
  listFindings: (params) => request(`/findings${query(params)}`),
  getFinding: (id) => request(`/findings/${id}`),

  // Reviews
  listReviews: (params) => request(`/reviews${query(params)}`),
  createReview: (payload) =>
    request('/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  trainingExport: (params) => request(`/reviews/training-export${query(params)}`),

  // Audit and metrics
  auditLog: (params) => request(`/audit-log${query(params)}`),
  metrics: () => request('/model/metrics'),
  dashboard: () => request('/dashboard'),
}
