import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyRequest } from 'fastify'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type CaseKind, type Language, type OptionId } from './cases.js'
import { compareAnswer } from './compare-agent.js'
import { getConfig, type AppConfig } from './config.js'
import { rankOptions } from './decision-model.js'
import { generateOptions } from './options-agent.js'
import { assertOpen, operation } from './model-operation.js'
import { AzureStore, MemoryStore, type Store } from './store.js'
import { Workshop, WorkshopError, type Limits } from './workshop.js'

function positive(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}.`)
  return value
}
export async function buildApp(options: {
  store?: Store; config?: AppConfig; limits?: Limits; logger?: boolean
  generate?: typeof generateOptions; compare?: typeof compareAnswer; rank?: typeof rankOptions
} = {}) {
  const config = options.config ?? getConfig()
  const endpoint = process.env.TABLE_ENDPOINT
  const eventId = process.env.WORKSHOP_EVENT_ID ?? 'workshop'
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(eventId)) throw new Error('Invalid WORKSHOP_EVENT_ID.')
  if (process.env.NODE_ENV === 'production' && !endpoint && !options.store && process.env.DEPLOYMENT_SMOKE !== 'true') {
    throw new Error('Production requires durable TABLE_ENDPOINT.')
  }
  const store = options.store ?? (endpoint ? new AzureStore(endpoint, eventId, process.env.TABLE_NAME ?? 'workshop') : new MemoryStore())
  await store.ready()
  const workshop = new Workshop(store, options.limits ?? {
    journeys: positive('JOURNEY_LIMIT', 5), startsPerMinute: positive('STARTS_PER_MINUTE', 2),
    eventRequests: positive('EVENT_REQUEST_LIMIT', 1000), concurrency: positive('MODEL_CONCURRENCY', 5),
  })
  const app = Fastify({ logger: options.logger ?? true, disableRequestLogging: true, bodyLimit: 16_384 })
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkshopError) {
      if (error.retryAfter) reply.header('retry-after', error.retryAfter)
      return reply.code(error.statusCode).send({ code: error.code, error: error.message, retryAfter: error.retryAfter })
    }
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500 ? error.statusCode : 503
    app.log.error({ status, errorType: error instanceof Error ? error.name : 'Unknown' }, 'Workshop request failed')
    return reply.code(status).send({ code: status < 500 ? 'INVALID_REQUEST' : 'UNAVAILABLE', error: status < 500 ? 'Invalid request.' : 'The service is temporarily unavailable. Please try again.' })
  })
  const origin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
  const identities = new WeakMap<FastifyRequest, string>()
  const token = (request: FastifyRequest) => {
    const identity = identities.get(request)
    if (!identity) throw new WorkshopError(401, 'IDENTITY_REQUIRED', 'Please refresh the workshop.')
    return identity
  }
  await app.register(cors, { origin, credentials: true })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('cache-control', 'no-store')
    if (!request.url.startsWith('/api/') || request.url.split('?')[0] === '/api/health' || request.url.split('?')[0] === '/api/ready') return
    assertOpen()
    if (request.method === 'POST' && request.headers.origin && request.headers.origin !== origin) {
      throw new WorkshopError(403, 'ORIGIN_DENIED', 'Request origin is not allowed.')
    }
    const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('workshop='))?.slice(9)
    const identity = await workshop.identity(cookie)
    identities.set(request, identity)
    if (identity !== cookie) {
      reply.header('set-cookie', `workshop=${identity}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
    }
  })
  app.get('/api/health', async () => ({ status: 'ok', modelProvider: config.provider, build: process.env.BUILD_SHA ?? 'local' }))
  app.get('/api/ready', async () => {
    await store.ready()
    return { status: 'ready', build: process.env.BUILD_SHA ?? 'local' }
  })
  app.get('/api/usage', async request => workshop.usage(token(request)))
  app.get('/api/dashboard', async () => workshop.dashboard())
  app.post<{
    Body: { language: Language; userAnswer: string; caseId?: CaseKind; customScenario?: string }
  }>('/api/sessions', {
    schema: { body: {
      type: 'object', required: ['language', 'userAnswer'], additionalProperties: false,
      properties: {
        language: { type: 'string', enum: ['en', 'el'] },
        userAnswer: { type: 'string', minLength: 1, maxLength: 500 },
        caseId: { type: 'string', enum: ['support', 'custom'] },
        customScenario: { type: 'string', maxLength: 1500 },
      },
    } },
  }, async request => {
    if (process.env.WORKSHOP_PAUSED === 'true') throw new WorkshopError(503, 'EVENT_PAUSED', 'New journeys are paused. Please contact the host.')
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new WorkshopError(400, 'INVALID_REQUEST', 'An idempotency key is required.')
    const { language, userAnswer, customScenario = '' } = request.body
    const caseId = request.body.caseId ?? 'support'
    if (!userAnswer.trim() || (caseId === 'custom' && customScenario.trim().length < 40)) throw new WorkshopError(400, 'INVALID_REQUEST', 'Please complete your answer and scenario.')
    const identity = token(request)
    const release = workshop.acquire()
    const run = operation(3)
    let id: string | undefined
    try {
      const admission = await workshop.start(identity, key, caseId)
      if (admission.cached) return admission.cached
      id = admission.id
      const result = await (options.generate ?? generateOptions)(config, { caseId, language, customScenario }, run.context)
      const comparison = await (options.compare ?? compareAnswer)(config, { language, scenario: result.scenario, userAnswer, options: result.options }, run.context)
      const response = { sessionId: id, prompt: result.prompt, restatement: result.restatement, options: result.options, comparison, isMock: result.isMock }
      await workshop.ready(id, identity, result.scenario, result.options, response)
      return response
    } catch (error) {
      if (id) await workshop.fail(id)
      throw error
    } finally {
      run.close()
      release()
      if (id) await workshop.release(identity, id)
    }
  })
  app.post<{ Params: { id: string }; Body: { selectedOption: OptionId } }>('/api/sessions/:id/select', {
    schema: { body: { type: 'object', required: ['selectedOption'], additionalProperties: false, properties: { selectedOption: { type: 'string', enum: ['A', 'B', 'C'] } } } },
  }, async request => {
    const identity = token(request)
    const release = workshop.acquire()
    const run = operation(1)
    let admitted = false
    try {
      const selection = await workshop.select(request.params.id, identity, request.body.selectedOption)
      if (selection.cached) return { ranking: selection.cached, dashboard: await workshop.dashboard() }
      admitted = true
      const pending = selection.journey
      if (!pending.scenario || !pending.options) throw new Error('Admitted journey is incomplete.')
      const ranking = await (options.rank ?? rankOptions)(config, pending.caseId, pending.scenario, pending.options, run.context)
      await workshop.complete(request.params.id, identity, request.body.selectedOption, ranking)
      return { ranking, dashboard: await workshop.dashboard() }
    } catch (error) {
      if (admitted) await workshop.fail(request.params.id)
      throw error
    } finally {
      run.close()
      release()
      if (admitted) await workshop.release(identity, request.params.id)
    }
  })
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist')
  if (existsSync(directory)) {
    await app.register(fastifyStatic, { root: directory, wildcard: false })
    app.get('/*', (request, reply) => {
      if (request.url.startsWith('/api/')) return reply.callNotFound()
      return reply.sendFile('index.html')
    })
  }
  return app
}
