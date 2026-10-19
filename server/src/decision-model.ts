import { DefaultAzureCredential } from '@azure/identity'
import type { AppConfig } from './config.js'
import { cases, rubric, type CaseKind, type DecisionOption, type OptionId } from './cases.js'
import type { ModelOperation } from './model-operation.js'

export interface RankedOption extends DecisionOption {
  probability: number
  rank: number
}

export interface RankingResult {
  rankedOptions: RankedOption[]
  topOption: OptionId
  confidence: number
  isMock: boolean
}

interface DecisionChoiceAnswer {
  type?: unknown
  choice?: unknown
  probabilities?: unknown
  scores?: unknown
  distribution?: unknown
}

function normaliseProbabilities(answer: DecisionChoiceAnswer): Record<OptionId, number> {
  const source = answer.probabilities ?? answer.scores ?? answer.distribution
  if (!source || typeof source !== 'object') {
    if (answer.choice === 'A' || answer.choice === 'B' || answer.choice === 'C') {
      return { A: answer.choice === 'A' ? 1 : 0, B: answer.choice === 'B' ? 1 : 0, C: answer.choice === 'C' ? 1 : 0 }
    }
    throw new Error('Decision-1 returned no option probabilities.')
  }
  const record = source as Record<string, unknown>
  const result = { A: Number(record.A), B: Number(record.B), C: Number(record.C) }
  if (Object.values(result).some((value) => !Number.isFinite(value))) {
    throw new Error('Decision-1 returned invalid option probabilities.')
  }
  return result
}

export function createMockRanking(
  caseId: CaseKind,
  options: [DecisionOption, DecisionOption, DecisionOption],
): RankingResult {
  void caseId
  const base = { A: 0.21, B: 0.64, C: 0.15 }
  const rankedOptions = options
    .map((option) => ({ ...option, probability: base[option.id], rank: 0 }))
    .sort((a, b) => b.probability - a.probability)
    .map((option, index) => ({ ...option, rank: index + 1 }))
  return {
    rankedOptions,
    topOption: rankedOptions[0]!.id,
    confidence: rankedOptions[0]!.probability,
    isMock: true,
  }
}

export async function rankOptions(
  config: AppConfig,
  caseId: CaseKind,
  scenario: string,
  options: [DecisionOption, DecisionOption, DecisionOption],
  operation?: ModelOperation,
): Promise<RankingResult> {
  if (config.provider === 'mock') return createMockRanking(caseId, options)
  if (!config.resourceEndpoint) throw new Error('Foundry resource endpoint is not configured.')

  const weights = cases[caseId === 'custom' ? 'support' : caseId].weights
  const criteria = Object.fromEntries(
    options.map((option) => [option.id, `${option.title}: ${option.description}`]),
  )
  const token = await new DefaultAzureCredential().getToken(
    'https://cognitiveservices.azure.com/.default',
  )
  operation?.beforeInference()
  const response = await fetch(
    `${config.resourceEndpoint}/providers/microsoft/v1/systemone`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: config.decisionDeployment,
        state: {
          scenario,
          options: criteria,
          rubric,
          weights,
        },
        questions: {
          recommended_option: {
            type: 'choice',
            instructions:
              'Independently select the strongest option using the supplied five-criterion rubric and scenario weights. Do not infer or consider any attendee selection.',
            criteria,
          },
        },
      }),
      signal: operation?.signal ?? AbortSignal.timeout(30_000),
    },
  )
  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Decision-1 request failed (${response.status}): ${details.slice(0, 400)}`)
  }
  const payload = (await response.json()) as {
    answers?: { recommended_option?: DecisionChoiceAnswer }
  }
  const answer = payload.answers?.recommended_option
  if (!answer || answer.type !== 'choice') throw new Error('Decision-1 returned an invalid choice answer.')
  const probabilities = normaliseProbabilities(answer)
  const rankedOptions = options
    .map((option) => ({ ...option, probability: probabilities[option.id], rank: 0 }))
    .sort((a, b) => b.probability - a.probability)
    .map((option, index) => ({ ...option, rank: index + 1 }))
  return {
    rankedOptions,
    topOption: rankedOptions[0]!.id,
    confidence: rankedOptions[0]!.probability,
    isMock: false,
  }
}
