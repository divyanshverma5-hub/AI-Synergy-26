/**
 * Tests for the API client and the shared vocabulary module.
 * These exercise the real client code against a stubbed `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../api'
import { HEALTH_CATEGORIES, PREDICTED_LABELS, REVIEW_STATUSES } from '../constants'

function mockFetch(handler) {
  global.fetch = vi.fn(handler)
}

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns parsed JSON on success', async () => {
    mockFetch(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    await expect(api.health()).resolves.toEqual({ status: 'ok' })
  })

  it('sends the request to the /api base path', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }))
    mockFetch(spy)
    await api.health()
    expect(spy.mock.calls[0][0]).toBe('/api/health')
  })

  it('builds query strings and omits empty values', async () => {
    const spy = vi.fn(async () => new Response('{"items":[]}', { status: 200 }))
    mockFetch(spy)
    await api.listFindings({ page: 2, label: 'conflicts', review_status: '' })
    const url = spy.mock.calls[0][0]
    expect(url).toContain('page=2')
    expect(url).toContain('label=conflicts')
    expect(url).not.toContain('review_status')
  })

  it('surfaces a string detail from an error response', async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ detail: 'Only PDF files are accepted.' }), { status: 415 }),
    )
    await expect(api.uploadDocument(new FormData())).rejects.toMatchObject({
      message: 'Only PDF files are accepted.',
      status: 415,
    })
  })

  it('flattens FastAPI validation error lists', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            detail: [{ loc: ['body', 'reason'], msg: 'reason is required' }],
          }),
          { status: 422 },
        ),
    )
    await expect(api.createReview({})).rejects.toThrow(/reason is required/)
  })

  it('reports an unreachable backend clearly', async () => {
    mockFetch(async () => {
      throw new TypeError('network down')
    })
    const error = await api.dashboard().catch((cause) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toMatch(/Could not reach the backend/)
    expect(error.status).toBe(0)
  })

  it('posts review payloads as JSON', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 201 }))
    mockFetch(spy)
    await api.createReview({ finding_id: 'f1', decision: 'confirm' })
    const [, options] = spy.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ finding_id: 'f1', decision: 'confirm' })
  })
})

describe('shared vocabulary', () => {
  it('keeps the classifier labels and workflow statuses separate', () => {
    expect(PREDICTED_LABELS).toEqual(['conflicts', 'removes_safeguard', 'consistent', 'unrelated'])
    expect(REVIEW_STATUSES).toContain('pending')
    expect(PREDICTED_LABELS).not.toContain('pending')
    expect(REVIEW_STATUSES).not.toContain('conflicts')
  })

  it('defines the four health categories', () => {
    expect(HEALTH_CATEGORIES).toEqual([
      'clear',
      'needs_review',
      'safeguard_removed',
      'direct_conflict',
    ])
  })
})
