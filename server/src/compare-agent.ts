import { AIProjectClient } from '@azure/ai-projects'
import { DefaultAzureCredential } from '@azure/identity'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from './config.js'
import type { DecisionOption, Language, OptionId } from './cases.js'
import type { ModelOperation } from './model-operation.js'

export interface CompareContext {
  language: Language
  scenario: string
  userAnswer: string
  options: [DecisionOption, DecisionOption, DecisionOption]
}

export interface Comparison {
  summary: string
  closestOption: OptionId | null
  overlap: string[]
  gaps: string[]
  insight: string
  isMock: boolean
}

const instructionPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prompts',
  'compare-agent.md',
)

export async function readCompareInstructions(): Promise<string> {
  return readFile(instructionPath, 'utf8')
}

function stringList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length > 600)) {
    throw new Error(`The comparison agent returned an invalid ${key}.`)
  }
  return (value as string[]).map((item) => item.trim()).filter(Boolean).slice(0, 4)
}

function validateComparison(value: unknown): Omit<Comparison, 'isMock'> {
  if (!value || typeof value !== 'object') throw new Error('The comparison agent returned invalid JSON.')
  const record = value as Record<string, unknown>
  const { summary, insight, closestOption } = record
  if (typeof summary !== 'string' || typeof insight !== 'string' || summary.length > 1500 || insight.length > 1500) {
    throw new Error('The comparison agent response is missing summary or insight.')
  }
  const closest =
    closestOption === 'A' || closestOption === 'B' || closestOption === 'C' ? closestOption : null
  return {
    summary: summary.trim(),
    insight: insight.trim(),
    closestOption: closest,
    overlap: stringList(record.overlap, 'overlap'),
    gaps: stringList(record.gaps, 'gaps'),
  }
}

const keywords: Record<OptionId, string[]> = {
  A: ['ai-first', 'automate', 'automation', 'chatbot', 'deploy', 'rollout', 'roll out', 'immediately', 'αυτοματ', 'εισαγωγή'],
  B: ['pilot', 'test', 'trial', 'experiment', 'small', 'measure', 'πιλοτ', 'δοκιμ', 'πείραμα'],
  C: ['knowledge base', 'process', 'foundation', 'fix', 'prepare', 'documentation', 'training', 'γνωσιακ', 'διαδικασ', 'βάσεις'],
}

export function createMockComparison(input: CompareContext): Comparison {
  const answer = input.userAnswer.toLowerCase()
  const scores = (['A', 'B', 'C'] as const).map((id) => ({
    id,
    score: keywords[id].filter((word) => answer.includes(word)).length,
  }))
  scores.sort((a, b) => b.score - a.score)
  const closest = scores[0]!.score > 0 ? scores[0]!.id : null
  const option = input.options.find((candidate) => candidate.id === closest)
  if (input.language === 'el') {
    return {
      summary: option
        ? `Η απάντησή σου πλησιάζει περισσότερο στην επιλογή ${option.id} («${option.title}»).`
        : 'Η απάντησή σου δεν ταιριάζει καθαρά με καμία από τις τρεις επιλογές.',
      closestOption: closest,
      overlap: option ? [`Κοινό στοιχείο με την επιλογή ${option.id}: ${option.description}`] : [],
      gaps: [
        'Οι επιλογές ορίζουν ρητά όρια επιτυχίας και ιδιοκτησία, που μπορεί να λείπουν από την απάντησή σου.',
        'Εξέτασε πώς η απάντησή σου ισορροπεί ταχύτητα, ποιότητα και επίδραση στους εργαζόμενους.',
      ],
      insight: 'Σύγκρινε τι θεώρησες αυτονόητο με αυτό που οι επιλογές κάνουν ρητό.',
      isMock: true,
    }
  }
  return {
    summary: option
      ? `Your answer is closest to Option ${option.id} (“${option.title}”).`
      : 'Your answer does not clearly match any of the three generated options.',
    closestOption: closest,
    overlap: option ? [`Shared direction with Option ${option.id}: ${option.description}`] : [],
    gaps: [
      'The options state explicit success thresholds and ownership, which your answer may leave implicit.',
      'Check how your answer balances speed, quality, and the impact on employees.',
    ],
    insight: 'Compare what you assumed with what the options make explicit.',
    isMock: true,
  }
}

async function runAgent(config: AppConfig, payload: Record<string, unknown>, operation?: ModelOperation): Promise<string> {
  if (!config.projectEndpoint) throw new Error('Foundry project endpoint is not configured.')
  const project = new AIProjectClient(config.projectEndpoint, new DefaultAzureCredential())
  const agent = await project.agents.get(config.compareAgentName, operation ? { abortSignal: operation.signal } : {})
  if (!agent.agent_endpoint) {
    throw new Error(`Prompt agent "${config.compareAgentName}" has no agent endpoint.`)
  }
  const openai = project.getOpenAIClient({
    azureConfig: { allowPreview: true, agentName: config.compareAgentName },
    maxRetries: 0,
    timeout: 60_000,
  })
  const conversation = await openai.conversations.create({
    items: [{ type: 'message', role: 'user', content: JSON.stringify(payload) }],
  }, operation ? { signal: operation.signal } : {})
  try {
    operation?.beforeInference()
    const response = await openai.responses.create(
      { conversation: conversation.id, max_output_tokens: 8000 },
      { ...(operation ? { signal: operation.signal } : {}) },
    )
    const content = response.output_text?.trim()
    if (!content) throw new Error('The comparison agent returned no content.')
    return content
  } finally {
    await openai.conversations.delete(conversation.id, { signal: AbortSignal.timeout(5000) })
  }
}

export async function compareAnswer(
  config: AppConfig,
  input: CompareContext,
  operation?: ModelOperation,
): Promise<Comparison> {
  if (config.provider === 'mock') return createMockComparison(input)
  const content = await runAgent(config, { ...input }, operation)
  const json = content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
  return { ...validateComparison(JSON.parse(json) as unknown), isMock: false }
}
