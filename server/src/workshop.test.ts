import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cases } from './cases.js'
import { createMockComparison } from './compare-agent.js'
import { createMockRanking } from './decision-model.js'
import { createMockOptions } from './options-agent.js'

describe('workshop model adapters', () => {
  it('returns exactly three built-in options without needing the user answer', () => {
    const result = createMockOptions({ caseId: 'support', language: 'en' })
    assert.equal(result.options.length, 3)
    assert.deepEqual(result.options.map((option) => option.id), ['A', 'B', 'C'])
    assert.equal(result.scenario, cases.support.scenario.en)
  })

  it('builds options for a custom case from the supplied description', () => {
    const result = createMockOptions({ caseId: 'custom', language: 'en', customScenario: 'My own case text.' })
    assert.equal(result.scenario, 'My own case text.')
    assert.equal(result.options.length, 3)
  })

  it('ranks all three options', () => {
    const result = createMockRanking('support', cases.support.options.en)
    assert.equal(result.rankedOptions.length, 3)
    assert.equal(result.topOption, 'B')
    assert.equal(result.rankedOptions[0]?.rank, 1)
  })

  it('compares a user answer to the generated options', () => {
    const comparison = createMockComparison({
      language: 'en',
      scenario: cases.support.scenario.en,
      userAnswer: 'Run a small pilot and measure results first.',
      options: cases.support.options.en,
    })
    assert.equal(comparison.closestOption, 'B')
    assert.ok(comparison.gaps.length > 0)
  })
})
