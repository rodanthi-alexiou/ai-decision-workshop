import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryStore } from './store.js'
import { Workshop, WorkshopError } from './workshop.js'
import { buildApp } from './app.js'
import { assertOpen, operation } from './model-operation.js'
import { generateOptions } from './options-agent.js'
import { rankOptions } from './decision-model.js'

const limits = { journeys: 5, startsPerMinute: 2, eventRequests: 1000, concurrency: 5 }
const config = { provider: 'mock' as const, optionsAgentName: 'options', optionsModelDeployment: 'mock', compareAgentName: 'compare', compareModelDeployment: 'mock', decisionDeployment: 'mock' }
const body = { language: 'en', userAnswer: 'Run a small pilot first.', caseId: 'support' }

describe('durable workshop limits', () => {
  it('rejects the sixth journey without a new reservation', async () => {
    let now = 100_000
    const store = new MemoryStore()
    const workshop = new Workshop(store, limits, () => now)
    const token = await workshop.identity()
    for (let i = 0; i < 5; i++) {
      await workshop.start(token, `attempt-${i}`, 'support')
      await workshop.release(token)
      now += 60_001
    }
    await assert.rejects(workshop.start(token, 'sixth', 'support'), (e: unknown) => e instanceof WorkshopError && e.code === 'QUOTA_EXHAUSTED')
    assert.equal((await workshop.usage(token)).remaining, 0)
    assert.equal((await new Workshop(store, limits).usage(token)).remaining, 0)
  })
  it('enforces a rolling minute and allows a different browser on the same event', async () => {
    const workshop = new Workshop(new MemoryStore(), limits)
    const first = await workshop.identity()
    for (let i = 0; i < 2; i++) { await workshop.start(first, `attempt-${i}`, 'support'); await workshop.release(first) }
    await assert.rejects(workshop.start(first, 'third', 'support'), (e: unknown) => e instanceof WorkshopError && e.code === 'RATE_LIMITED')
    await workshop.start(await workshop.identity(), 'another-browser', 'support')
  })
  it('atomically enforces the exact global cap across concurrent admissions', async () => {
    const workshop = new Workshop(new MemoryStore(), { ...limits, eventRequests: 4 })
    const tokens = await Promise.all([workshop.identity(), workshop.identity(), workshop.identity()])
    const results = await Promise.allSettled(tokens.map(token => workshop.start(token, 'attempt', 'support')))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  })
  it('does not replay an interrupted creation or expose it to another browser', async () => {
    let now = 0
    const workshop = new Workshop(new MemoryStore(), limits, () => now)
    const token = await workshop.identity()
    const { id } = await workshop.start(token, 'attempt', 'support')
    now += 70_000
    await assert.rejects(workshop.start(token, 'attempt', 'support'), (e: unknown) => e instanceof WorkshopError && e.code === 'INTERRUPTED')
    await assert.rejects(workshop.select(id, await workshop.identity(), 'B'), (e: unknown) => e instanceof WorkshopError && e.statusCode === 404)
    now += 86_400_000
    await assert.rejects(workshop.select(id, token, 'B'))
  })
  it('limits each model operation and checks manual closure before new inference', () => {
    const run = operation(1)
    try {
      run.context.beforeInference()
      assert.throws(() => run.context.beforeInference())
      process.env.WORKSHOP_CLOSED = 'true'
      assert.throws(assertOpen, (e: unknown) => e instanceof WorkshopError && e.code === 'WORKSHOP_CLOSED')
    } finally { delete process.env.WORKSHOP_CLOSED; run.close() }
  })
  it('rejects at the exact scheduled closure boundary', () => {
    const original = Date.now
    process.env.WORKSHOP_ENDS_AT = '2026-10-18T20:00:00Z'
    const boundary = Date.parse(process.env.WORKSHOP_ENDS_AT)
    try {
      Date.now = () => boundary - 1
      assertOpen()
      Date.now = () => boundary
      assert.throws(assertOpen)
      Date.now = () => boundary + 1
      assert.throws(assertOpen)
    } finally { Date.now = original; delete process.env.WORKSHOP_ENDS_AT }
  })
})

describe('public API contracts', () => {
  it('runs a journey, caches ranking once, and enforces ownership and closure', async () => {
    const app = await buildApp({ store: new MemoryStore(), config, logger: false })
    try {
      const initial = await app.inject('/api/usage')
      const cookie = initial.cookies[0]!
      const headers = { cookie: `${cookie.name}=${cookie.value}`, 'idempotency-key': crypto.randomUUID() }
      const created = await app.inject({ method: 'POST', url: '/api/sessions', headers, payload: body })
      assert.equal(created.statusCode, 200, created.body)
      const { sessionId } = created.json() as { sessionId: string }
      const duplicate = await app.inject({ method: 'POST', url: '/api/sessions', headers, payload: body })
      assert.equal(duplicate.json().sessionId, sessionId)
      const other = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/select`, payload: { selectedOption: 'B' } })
      assert.equal(other.statusCode, 404)
      const selected = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/select`, headers, payload: { selectedOption: 'B' } })
      assert.equal(selected.statusCode, 200, selected.body)
      const repeated = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/select`, headers, payload: { selectedOption: 'B' } })
      assert.equal(repeated.json().dashboard.responses, 1)
      process.env.WORKSHOP_CLOSED = 'true'
      assert.equal((await app.inject({ url: '/api/usage', headers })).statusCode, 403)
      assert.equal((await app.inject({ url: '/api/dashboard', headers })).statusCode, 403)
      assert.equal((await app.inject('/api/health')).statusCode, 200)
    } finally { delete process.env.WORKSHOP_CLOSED; await app.close() }
  })
  it('rejects malformed input and does not leak provider failures', async () => {
    const app = await buildApp({
      store: new MemoryStore(), config, logger: false,
      generate: async () => { throw new Error('PRIVATE UPSTREAM TOKEN') },
    })
    try {
      const invalid = await app.inject({ method: 'POST', url: '/api/sessions', payload: { userAnswer: 42 } })
      assert.equal(invalid.statusCode, 400)
      const failed = await app.inject({ method: 'POST', url: '/api/sessions', headers: { 'idempotency-key': crypto.randomUUID() }, payload: body })
      assert.equal(failed.statusCode, 503, failed.body)
      assert.equal(failed.body.includes('PRIVATE'), false)
    } finally { await app.close() }
  })
  it('fails closed when storage becomes unavailable', async () => {
    const store = new MemoryStore()
    const app = await buildApp({ store, config, logger: false })
    store.get = async () => { throw new Error('PRIVATE STORAGE DETAILS') }
    try {
      const response = await app.inject({ method: 'POST', url: '/api/sessions', headers: { 'idempotency-key': crypto.randomUUID() }, payload: body })
      assert.equal(response.statusCode, 503)
      assert.equal(response.body.includes('PRIVATE'), false)
    } finally { await app.close() }
  })
  it('admits at most five active model operations from thirty simultaneous browsers', async () => {
    let active = 0
    let peak = 0
    const app = await buildApp({
      store: new MemoryStore(), config, logger: false,
      generate: async (...args) => {
        peak = Math.max(peak, ++active)
        await new Promise(resolve => setTimeout(resolve, 100))
        active--
        return generateOptions(...args)
      },
    })
    try {
      const responses = await Promise.all(Array.from({ length: 30 }, () => app.inject({
        method: 'POST', url: '/api/sessions', headers: { 'idempotency-key': crypto.randomUUID() }, payload: body,
      })))
      assert.equal(peak, 5)
      assert.equal(responses.filter(response => response.statusCode === 200).length, 5)
      assert.equal(responses.filter(response => response.statusCode === 503 && response.json().code === 'BUSY').length, 25)
    } finally { await app.close() }
  })
  it('performs one ranking and dashboard increment for concurrent duplicate selections', async () => {
    let calls = 0
    const app = await buildApp({
      store: new MemoryStore(), config, logger: false,
      rank: async (...args) => { calls++; await new Promise(resolve => setTimeout(resolve, 50)); return rankOptions(...args) },
    })
    try {
      const initial = await app.inject('/api/usage')
      const cookie = initial.cookies[0]!
      const headers = { cookie: `${cookie.name}=${cookie.value}`, 'idempotency-key': crypto.randomUUID() }
      const created = await app.inject({ method: 'POST', url: '/api/sessions', headers, payload: body })
      const url = `/api/sessions/${created.json().sessionId}/select`
      const responses = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url, headers, payload: { selectedOption: 'B' } })))
      assert.equal(calls, 1)
      assert.equal(responses.filter(response => response.statusCode === 200).length, 1)
      assert.equal(responses.filter(response => response.statusCode === 409).length, 1)
      assert.equal((await app.inject({ url: '/api/dashboard', headers })).json().responses, 1)
    } finally { await app.close() }
  })
})
