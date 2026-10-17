import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type CaseKind, type DecisionOption, type Language, type OptionId } from './cases.js'
import { compareAnswer } from './compare-agent.js'
import { getConfig } from './config.js'
import { rankOptions, type RankingResult } from './decision-model.js'
import { generateOptions } from './options-agent.js'

interface PendingSession {
  caseId: CaseKind
  scenario: string
  options: [DecisionOption, DecisionOption, DecisionOption]
}

interface StoredSession {
  selectedOption: OptionId
  ranking: RankingResult
}

const app = Fastify({ logger: true })
const config = getConfig()
const pendingSessions = new Map<string, PendingSession>()
const sessions = new Map<string, StoredSession>()

await app.register(cors, {
  origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
})

function dashboard() {
  const values = [...sessions.values()]
  const total = values.length
  const selected = { A: 0, B: 0, C: 0 }
  let aligned = 0
  let confidence = 0
  for (const session of values) {
    selected[session.selectedOption] += 1
    aligned += Number(session.selectedOption === session.ranking.topOption)
    confidence += session.ranking.confidence
  }
  return {
    responses: total,
    distribution: {
      A: total ? selected.A / total : 0,
      B: total ? selected.B / total : 0,
      C: total ? selected.C / total : 0,
    },
    alignmentRate: total ? aligned / total : 0,
    averageConfidence: total ? confidence / total : 0,
  }
}

app.get('/api/health', async () => ({
  status: 'ok',
  modelProvider: config.provider,
  optionsAgent: config.optionsAgentName,
  compareAgent: config.compareAgentName,
  decisionDeployment: config.decisionDeployment,
}))

app.get('/api/dashboard', async () => dashboard())

// The options are generated from the scenario only; the user's answer is used
// solely for the comparison and is neither stored nor logged.
app.post<{
  Body: { language?: Language; userAnswer?: string; caseId?: CaseKind; customScenario?: string }
}>('/api/sessions', async (request, reply) => {
  const { language, userAnswer, customScenario } = request.body ?? {}
  const caseId: CaseKind = request.body?.caseId === 'custom' ? 'custom' : 'support'
  if (language !== 'en' && language !== 'el') {
    return reply.code(400).send({ error: 'Language must be en or el.' })
  }
  const answer = userAnswer?.trim() ?? ''
  if (answer.length === 0 || answer.length > 500) {
    return reply.code(400).send({ error: 'Your answer must contain 1–500 characters.' })
  }
  const scenarioText = customScenario?.trim() ?? ''
  if (caseId === 'custom' && (scenarioText.length < 40 || scenarioText.length > 1500)) {
    return reply.code(400).send({ error: 'Your case description must contain 40–1500 characters.' })
  }
  const result = await generateOptions(config, { caseId, language, customScenario: scenarioText })
  const comparison = await compareAnswer(config, {
    language,
    scenario: result.scenario,
    userAnswer: answer,
    options: result.options,
  })
  const id = crypto.randomUUID()
  pendingSessions.set(id, { caseId, scenario: result.scenario, options: result.options })
  return {
    sessionId: id,
    prompt: result.prompt,
    restatement: result.restatement,
    options: result.options,
    comparison,
    isMock: result.isMock,
  }
})

app.post<{
  Params: { id: string }
  Body: { selectedOption?: OptionId }
}>('/api/sessions/:id/select', async (request, reply) => {
  const pending = pendingSessions.get(request.params.id)
  if (!pending) return reply.code(404).send({ error: 'Session not found or already ranked.' })
  const { selectedOption } = request.body ?? {}
  if (selectedOption !== 'A' && selectedOption !== 'B' && selectedOption !== 'C') {
    return reply.code(400).send({ error: 'selectedOption must be A, B, or C.' })
  }
  const ranking = await rankOptions(config, pending.caseId, pending.scenario, pending.options)
  pendingSessions.delete(request.params.id)
  sessions.set(request.params.id, { selectedOption, ranking })
  return { ranking, dashboard: dashboard() }
})

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const clientDirectory = resolve(serverDirectory, '..', '..', 'client', 'dist')
if (existsSync(clientDirectory)) {
  await app.register(fastifyStatic, {
    root: clientDirectory,
    wildcard: false,
  })
  app.get('/*', (request, reply) => {
    if (request.url.startsWith('/api/')) return reply.callNotFound()
    return reply.sendFile('index.html')
  })
}

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  reply.code(500).send({ error: message })
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })
