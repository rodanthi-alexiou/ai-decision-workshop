import { AIProjectClient } from '@azure/ai-projects'
import { DefaultAzureCredential } from '@azure/identity'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from './config.js'
import type { DecisionOption, Language, OptionId } from './cases.js'

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
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`The comparison agent returned an invalid ${key}.`)
  }
  return (value as string[]).map((item) => item.trim()).filter(Boolean).slice(0, 4)
}

function validateComparison(value: unknown): Omit<Comparison, 'isMock'> {
  if (!value || typeof value !== 'object') throw new Error('The comparison agent returned invalid JSON.')
  const record = value as Record<string, unknown>
  const { summary, insight, closestOption } = record
  if (typeof summary !== 'string' || typeof insight !== 'string') {
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

async function runAgent(config: AppConfig, payload: Record<string, unknown>): Promise<string> {
  if (!config.projectEndpoint) throw new Error('Foundry project endpoint is not configured.')
  const project = new AIProjectClient(config.projectEndpoint, new DefaultAzureCredential())
  const agent = await project.agents.get(config.compareAgentName)
  if (!agent.agent_endpoint) {
    throw new Error(`Prompt agent "${config.compareAgentName}" has no agent endpoint.`)
  }
  const openai = project.getOpenAIClient({
    azureConfig: { allowPreview: true, agentName: config.compareAgentName },
  })
  const conversation = await openai.conversations.create({
    items: [{ type: 'message', role: 'user', content: JSON.stringify(payload) }],
  })
  try {
    const response = await openai.responses.create({ conversation: conversation.id })
    const content = response.output_text?.trim()
    if (!content) throw new Error('The comparison agent returned no content.')
    return content
  } finally {
    await openai.conversations.delete(conversation.id)
  }
}

export async function compareAnswer(
  config: AppConfig,
  input: CompareContext,
): Promise<Comparison> {
  if (config.provider === 'mock') return createMockComparison(input)
  const content = await runAgent(config, { ...input })
  const json = content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
  return { ...validateComparison(JSON.parse(json) as unknown), isMock: false }
}
