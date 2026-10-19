import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://127.0.0.1:3001'
const expected = process.argv[3]
const liveJourneys = process.argv.includes('--live-journeys')
const get = async (path, init) => {
  const response = await fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(init?.method === 'POST' ? 90_000 : 15_000) })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return response
}
let health
const readinessDeadline = Date.now() + 180_000
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    health = await (await get('/api/health')).json()
    await get('/api/ready')
    if (expected && expected !== '--live-journeys') assert.equal(health.build, expected)
    break
  } catch (error) {
    if (attempt === 29 || Date.now() >= readinessDeadline) throw error
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
const html = await (await get('/')).text()
const asset = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)?.[1]
assert.ok(asset, 'Built JavaScript asset is referenced')
assert.match((await get(asset)).headers.get('content-type') ?? '', /javascript/)
assert.match((await get('/facilitator')).headers.get('content-type') ?? '', /html/)
if (liveJourneys) {
  assert.equal(health.modelProvider, 'foundry')
  for (const [language, custom] of [['en', false], ['el', false], ['en', true]]) {
    const start = Date.now()
    const usage = await get('/api/usage')
    const cookie = usage.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)
    const headers = { cookie, origin: base.replace(/\/$/, ''), 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }
    const session = await (await get('/api/sessions', {
      method: 'POST', headers, body: JSON.stringify({
        language, caseId: custom ? 'custom' : 'support',
        userAnswer: language === 'el' ? 'Ξεκινήστε με ένα μικρό πιλοτικό πρόγραμμα και ανθρώπινο έλεγχο.' : 'Run a small pilot with human review and measure results.',
        ...(custom ? { customScenario: 'A municipal service team wants to use AI to triage incoming requests. It has a small budget, a four-week pilot window, and must keep human approval for all outbound responses.' } : {}),
      }),
    })).json()
    assert.equal(session.isMock, false)
    assert.equal(session.options.length, 3)
    const selected = await (await get(`/api/sessions/${session.sessionId}/select`, {
      method: 'POST', headers, body: JSON.stringify({ selectedOption: 'B' }),
    })).json()
    assert.equal(selected.ranking.isMock, false)
    assert.equal(selected.ranking.rankedOptions.length, 3)
    assert.equal((await (await get('/api/usage', { headers: { cookie } })).json()).remaining, 4)
    const repeated = await (await get(`/api/sessions/${session.sessionId}/select`, {
      method: 'POST', headers, body: JSON.stringify({ selectedOption: 'B' }),
    })).json()
    assert.equal(repeated.dashboard.responses, selected.dashboard.responses)
    console.log(JSON.stringify({ language, custom, live: true, durationMs: Date.now() - start }))
  }
}
console.log(JSON.stringify({ smoke: 'passed', build: health.build, provider: health.modelProvider }))
