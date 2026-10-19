import { createHash, randomUUID } from 'node:crypto'
import type { CaseKind, DecisionOption, OptionId } from './cases.js'
import type { RankingResult } from './decision-model.js'
import { Conflict, type Store, type Write } from './store.js'

export class WorkshopError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public retryAfter?: number) {
    super(message)
  }
}
export interface Limits { journeys: number; startsPerMinute: number; eventRequests: number; concurrency: number }
interface Browser { used: number; starts: number[]; busyUntil: number; busyId?: string }
interface Event {
  reserved: number; responses: number; selected: Record<OptionId, number>; aligned: number; confidence: number
}
export interface Journey {
  owner: string; expires: number; state: 'creating' | 'ready' | 'ranking' | 'complete' | 'failed'
  leaseUntil: number; caseId: CaseKind; scenario?: string
  options?: [DecisionOption, DecisionOption, DecisionOption]
  response?: unknown; ranking?: RankingResult; selectedOption?: OptionId
}
const emptyEvent = (): Event => ({
  reserved: 0, responses: 0, selected: { A: 0, B: 0, C: 0 }, aligned: 0, confidence: 0,
})
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const browserKey = (token: string) => `browser-${digest(token)}`

export class Workshop {
  private active = 0
  constructor(public store: Store, public limits: Limits, private now = Date.now) {}
  async retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try { return await operation() } catch (error) {
        if (!(error instanceof Conflict)) throw error
      }
    }
    throw new WorkshopError(503, 'BUSY', 'The workshop is busy. Please try again.', 5)
  }
  async identity(cookie?: string) {
    if (cookie && /^[0-9a-f-]{36}$/.test(cookie) && await this.store.get(browserKey(cookie))) return cookie
    const token = randomUUID()
    await this.store.commit([{ key: browserKey(token), value: { used: 0, starts: [], busyUntil: 0 } satisfies Browser }])
    return token
  }
  async usage(token: string) {
    const browser = await this.store.get<Browser>(browserKey(token))
    return { remaining: Math.max(0, this.limits.journeys - (browser?.value.used ?? 0)), limit: this.limits.journeys }
  }
  async dashboard() {
    const event = (await this.store.get<Event>('event'))?.value ?? emptyEvent()
    return {
      responses: event.responses,
      distribution: {
        A: event.responses ? event.selected.A / event.responses : 0,
        B: event.responses ? event.selected.B / event.responses : 0,
        C: event.responses ? event.selected.C / event.responses : 0,
      },
      alignmentRate: event.responses ? event.aligned / event.responses : 0,
      averageConfidence: event.responses ? event.confidence / event.responses : 0,
    }
  }
  acquire() {
    if (this.active >= this.limits.concurrency) throw new WorkshopError(503, 'BUSY', 'The workshop is busy. Please try again.', 5)
    this.active++
    return () => { this.active-- }
  }
  async start(token: string, key: string, caseId: CaseKind) {
    const id = digest(`${browserKey(token)}:${key}`)
    return this.retry(async () => {
      const existing = await this.store.get<Journey>(`session-${id}`)
      if (existing) {
        this.assertOwned(existing.value, token)
        if (existing.value.response && existing.value.state !== 'failed') return { id, cached: existing.value.response }
        throw new WorkshopError(409, 'INTERRUPTED', 'This attempt is already running or was interrupted. Do not replay it.', 5)
      }
      const browser = await this.store.get<Browser>(browserKey(token))
      if (!browser) throw new WorkshopError(401, 'IDENTITY_REQUIRED', 'Please refresh the workshop.')
      const now = this.now()
      const starts = browser.value.starts.filter(time => time > now - 60_000)
      if (browser.value.busyUntil > now) throw new WorkshopError(429, 'IN_PROGRESS', 'One operation is already running.', 5)
      if (browser.value.used >= this.limits.journeys) throw new WorkshopError(429, 'QUOTA_EXHAUSTED', 'Your workshop allowance has been used.')
      if (starts.length >= this.limits.startsPerMinute) {
        throw new WorkshopError(429, 'RATE_LIMITED', 'Please wait before starting another journey.', Math.max(1, Math.ceil((starts[0]! + 60_000 - now) / 1000)))
      }
      const event = await this.store.get<Event>('event')
      const value = event?.value ?? emptyEvent()
      if (value.reserved + 4 > this.limits.eventRequests) throw new WorkshopError(429, 'EVENT_EXHAUSTED', 'The event allowance has been used. Please contact the host.')
      const eventWrite: Write = { key: 'event', value: { ...value, reserved: value.reserved + 4 } }
      if (event) eventWrite.version = event.version
      await this.store.commit([
        eventWrite,
        { key: browserKey(token), version: browser.version, value: { used: browser.value.used + 1, starts: [...starts, now], busyUntil: now + 120_000, busyId: id } },
        { key: `session-${id}`, value: { owner: browserKey(token), caseId, state: 'creating', expires: now + 86_400_000, leaseUntil: now + 65_000 } satisfies Journey },
      ])
      return { id, cached: undefined }
    })
  }
  assertOwned(journey: Journey, token: string) {
    if (journey.owner !== browserKey(token) || journey.expires <= this.now()) {
      throw new WorkshopError(404, 'SESSION_NOT_FOUND', 'Session not found or expired.')
    }
  }
  async ready(id: string, token: string, scenario: string, options: Journey['options'], response: unknown) {
    await this.retry(async () => {
      const row = await this.store.get<Journey>(`session-${id}`)
      if (!row) throw new WorkshopError(404, 'SESSION_NOT_FOUND', 'Session not found.')
      this.assertOwned(row.value, token)
      await this.store.commit([{ key: `session-${id}`, version: row.version, value: { ...row.value, state: 'ready', scenario, options, response } }])
    })
  }
  async select(id: string, token: string, selectedOption: OptionId) {
    return this.retry(async () => {
      const row = await this.store.get<Journey>(`session-${id}`)
      if (!row) throw new WorkshopError(404, 'SESSION_NOT_FOUND', 'Session not found.')
      this.assertOwned(row.value, token)
      if (row.value.state === 'complete' && row.value.ranking) {
        if (row.value.selectedOption !== selectedOption) throw new WorkshopError(409, 'ALREADY_RANKED', 'This journey has already been ranked for your original choice.')
        return { journey: row.value, cached: row.value.ranking }
      }
      if (row.value.state !== 'ready') throw new WorkshopError(409, 'INTERRUPTED', 'Ranking is already running or was interrupted.', 5)
      const browser = await this.store.get<Browser>(browserKey(token))
      if (!browser) throw new WorkshopError(401, 'IDENTITY_REQUIRED', 'Please refresh the workshop.')
      if (browser.value.busyUntil > this.now()) throw new WorkshopError(429, 'IN_PROGRESS', 'One operation is already running.', 5)
      await this.store.commit([
        { key: `session-${id}`, version: row.version, value: { ...row.value, state: 'ranking', selectedOption } },
        { key: browserKey(token), version: browser.version, value: { ...browser.value, busyUntil: this.now() + 120_000, busyId: id } },
      ])
      return { journey: row.value, cached: undefined }
    })
  }
  async complete(id: string, token: string, selectedOption: OptionId, ranking: RankingResult) {
    await this.retry(async () => {
      const row = await this.store.get<Journey>(`session-${id}`)
      const event = await this.store.get<Event>('event')
      if (!row || !event) throw new Error('Missing admitted journey state.')
      this.assertOwned(row.value, token)
      if (row.value.state === 'complete') return
      if (row.value.state !== 'ranking' || row.value.selectedOption !== selectedOption) throw new Error('Journey is not admitted for this ranking.')
      const value = event.value
      const completed = { ...row.value, state: 'complete', ranking, selectedOption }
      delete completed.scenario
      delete completed.options
      await this.store.commit([
        { key: `session-${id}`, version: row.version, value: completed },
        { key: 'event', version: event.version, value: {
          ...value, responses: value.responses + 1,
          selected: { ...value.selected, [selectedOption]: value.selected[selectedOption] + 1 },
          aligned: value.aligned + Number(selectedOption === ranking.topOption),
          confidence: value.confidence + ranking.confidence,
        } },
      ])
    })
  }
  async fail(id: string) {
    await this.retry(async () => {
      const row = await this.store.get<Journey>(`session-${id}`)
      if (row && row.value.state !== 'complete') await this.store.commit([{ key: `session-${id}`, version: row.version, value: { ...row.value, state: 'failed' } }])
    })
  }
  async release(token: string, id?: string) {
    await this.retry(async () => {
      const row = await this.store.get<Browser>(browserKey(token))
      if (row && (!id || row.value.busyId === id)) await this.store.commit([{ key: browserKey(token), version: row.version, value: { ...row.value, busyUntil: 0 } }])
    })
  }
}
