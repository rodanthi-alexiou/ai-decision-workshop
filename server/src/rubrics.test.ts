import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from './app.js'
import { cases } from './cases.js'
import { buildDecisionRequest, rankOptions } from './decision-model.js'
import { defaultRubric, rubricPresets, validateRubric, type DecisionRubric } from './rubrics.js'
import { MemoryStore } from './store.js'

const config = {
  provider: 'mock' as const, optionsAgentName: 'options', optionsModelDeployment: 'mock',
  compareAgentName: 'compare', compareModelDeployment: 'mock', decisionDeployment: 'decision-ranker',
}
const custom: DecisionRubric = {
  preset: 'custom',
  criteria: [
    { id: 'safety', label: 'Safety', description: 'Prefer less risk of harm.', weight: 70 },
    { id: 'cost', label: 'Affordability', description: 'Prefer lower total cost within budget.', weight: 30 },
  ],
}

describe('rubric definitions and request construction', () => {
  it('keeps existing support weights and offers valid bilingual presets', () => {
    assert.deepEqual(Object.fromEntries(defaultRubric().criteria.map(item => [item.id, item.weight])), cases.support.weights)
    for (const language of ['en', 'el'] as const) {
      for (const preset of rubricPresets(language)) {
        assert.deepEqual(validateRubric({ preset: preset.id, criteria: preset.criteria }).criteria, preset.criteria)
      }
    }
  })
  it('sends custom definitions and weights with the exact scenario and generated choices', () => {
    const scenario = 'My team needs a safer process within our available budget.'
    const request = buildDecisionRequest('decision-ranker', scenario, cases.support.options.en, custom)
    assert.equal(request.state.scenario, scenario)
    assert.deepEqual(request.state.weights, { safety: 70, cost: 30 })
    assert.deepEqual(request.state.rubric, ['Safety', 'Affordability'])
    assert.deepEqual(request.state.rubricDefinitions[0], { id: 'safety', label: 'Safety', description: 'Prefer less risk of harm.' })
    assert.deepEqual(request.questions.recommended_option.criteria, request.state.options)
    assert.equal(request.state.options.B, `${cases.support.options.en[1].title}: ${cases.support.options.en[1].description}`)
    assert.ok(!('userAnswer' in request.state))
    assert.ok(!('selectedOption' in request.state))
  })
  it('rejects invalid totals, blank or duplicated criteria and non-integer weights', () => {
    const change = (criteria: DecisionRubric['criteria']) => ({ preset: 'custom' as const, criteria })
    assert.throws(() => validateRubric(change(custom.criteria.map(item => ({ ...item, weight: 20 })))))
    assert.throws(() => validateRubric(change(custom.criteria.map(item => ({ ...item, label: 'Same' })))))
    assert.throws(() => validateRubric(change(custom.criteria.map(item => ({ ...item, description: ' ' })))))
    assert.throws(() => validateRubric(change(custom.criteria.map(item => ({ ...item, id: 'same' })))))
    assert.throws(() => validateRubric(change(custom.criteria.map((item, index) => ({ ...item, weight: index ? 29.5 : 70.5 })))))
    assert.throws(() => validateRubric(change(custom.criteria.map((item, index) => ({ ...item, weight: index ? 0 : 100 })))))
    assert.throws(() => validateRubric({ ...custom, preset: 'balanced' }))
  })
})

describe('rubric API journey', () => {
  it('accepts custom priorities, echoes the actual evaluation, and caches only the same rubric', async () => {
    let calls = 0
    let received: DecisionRubric | undefined
    const app = await buildApp({
      config, logger: false, store: new MemoryStore(),
      rank: async (...args) => { calls++; received = args[5]; return rankOptions(...args) },
    })
    try {
      const initial = await app.inject('/api/usage')
      const cookie = initial.cookies[0]!
      const headers = { cookie: `${cookie.name}=${cookie.value}`, 'idempotency-key': crypto.randomUUID() }
      const scenario = 'Our operations team needs to improve safety without exceeding a limited budget.'
      const created = await app.inject({
        method: 'POST', url: '/api/sessions', headers,
        payload: { language: 'en', caseId: 'custom', customScenario: scenario, userAnswer: 'PRIVATE_ANSWER_MARKER' },
      })
      assert.equal(created.statusCode, 200, created.body)
      assert.equal(created.json().scenario, scenario)
      const url = `/api/sessions/${created.json().sessionId}/select`
      const invalidRubrics = [
        { ...custom, criteria: custom.criteria.map(item => ({ ...item, weight: 10 })) },
        { ...custom, criteria: custom.criteria.map(item => ({ ...item, weight: -1 })) },
        { ...custom, criteria: custom.criteria.map(item => ({ ...item, weight: 50.5 })) },
        { ...custom, criteria: custom.criteria.map(item => ({ ...item, label: ' ' })) },
        { ...custom, criteria: [...custom.criteria, ...custom.criteria] },
        { ...custom, criteria: [custom.criteria[0]] },
        { ...custom, criteria: Array.from({ length: 9 }, (_, index) => ({ ...custom.criteria[0], id: `item${index}` })) },
        { ...custom, criteria: custom.criteria.map(item => ({ ...item, description: 'x'.repeat(301) })) },
      ]
      for (const rubric of invalidRubrics) {
        const rejected = await app.inject({ method: 'POST', url, headers, payload: { selectedOption: 'A', rubric } })
        assert.equal(rejected.statusCode, 400, rejected.body)
      }
      assert.equal(calls, 0, 'Invalid requests must not consume inference or lock the session.')
      const payload = { selectedOption: 'A', rubric: custom }
      const selected = await app.inject({ method: 'POST', url, headers, payload })
      assert.equal(selected.statusCode, 200, selected.body)
      assert.deepEqual(received, custom)
      assert.deepEqual(selected.json().ranking.evaluation.rubric, custom)
      assert.equal(selected.json().ranking.evaluation.deployment, 'decision-ranker')
      assert.equal(JSON.stringify(selected.json().ranking).includes('PRIVATE_ANSWER_MARKER'), false)
      assert.equal(selected.json().ranking.isMock, true)
      const cached = await app.inject({ method: 'POST', url, headers, payload })
      assert.deepEqual(cached.json(), selected.json())
      const changed = await app.inject({ method: 'POST', url, headers, payload: { ...payload, rubric: defaultRubric() } })
      assert.equal(changed.statusCode, 409)
      assert.equal(changed.json().code, 'ALREADY_RANKED')
      assert.equal(calls, 1)
      assert.equal(cached.json().dashboard.responses, 1)
    } finally { await app.close() }
  })
  it('serves translated presets and still supports callers without a rubric', async () => {
    const app = await buildApp({ config, logger: false, store: new MemoryStore() })
    try {
      const catalog = await app.inject('/api/rubrics?language=el')
      assert.equal(catalog.statusCode, 200)
      assert.equal(catalog.json().presets[0].label, 'Ισορροπία εργαστηρίου')
      const cookie = catalog.cookies[0]!
      const headers = { cookie: `${cookie.name}=${cookie.value}`, 'idempotency-key': crypto.randomUUID() }
      const created = await app.inject({
        method: 'POST', url: '/api/sessions', headers, payload: { language: 'en', userAnswer: 'Try a pilot.' },
      })
      const selected = await app.inject({
        method: 'POST', url: `/api/sessions/${created.json().sessionId}/select`, headers, payload: { selectedOption: 'B' },
      })
      assert.equal(selected.statusCode, 200, selected.body)
      assert.deepEqual(selected.json().ranking.evaluation.rubric, defaultRubric())
    } finally { await app.close() }
  })
})
