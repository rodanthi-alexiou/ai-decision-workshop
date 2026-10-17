import { AIProjectClient } from '@azure/ai-projects'
import { DefaultAzureCredential } from '@azure/identity'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from './config.js'
import { cases, type CaseKind, type DecisionOption, type Language } from './cases.js'

export interface OptionsRequest {
  caseId: CaseKind
  language: Language
  customScenario?: string
}

const customPrompt: Record<Language, string> = {
  en: 'What would you do, or what did you already do, in this situation?',
  el: 'Τι θα έκανες, ή τι έχεις ήδη κάνει, σε αυτή την περίπτωση;',
}

const customOptions: Record<Language, [DecisionOption, DecisionOption, DecisionOption]> = {
  en: [
    { id: 'A', title: 'Act decisively', description: 'Commit to a full solution now and accept the delivery risk.' },
    { id: 'B', title: 'Test small first', description: 'Run a time-boxed pilot with clear success thresholds before scaling.' },
    { id: 'C', title: 'Prepare foundations', description: 'Resolve the main blockers and gather evidence before committing.' },
  ],
  el: [
    { id: 'A', title: 'Αποφασιστική δράση', description: 'Δέσμευση σε πλήρη λύση τώρα, αποδεχόμενοι τον κίνδυνο υλοποίησης.' },
    { id: 'B', title: 'Πρώτα μικρό τεστ', description: 'Χρονικά οριοθετημένο πιλοτικό με σαφή όρια επιτυχίας πριν την κλιμάκωση.' },
    { id: 'C', title: 'Προετοιμασία βάσεων', description: 'Άρση των βασικών εμποδίων και συλλογή στοιχείων πριν τη δέσμευση.' },
  ],
}

export interface OptionsResult {
  scenario: string
  prompt: string
  restatement: string
  options: [DecisionOption, DecisionOption, DecisionOption]
  isMock: boolean
}

const instructionPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prompts',
  'options-agent.md',
)

export async function readAgentInstructions(): Promise<string> {
  return readFile(instructionPath, 'utf8')
}

function validateOptions(value: unknown): {
  restatement: string
  options: [DecisionOption, DecisionOption, DecisionOption]
} {
  if (!value || typeof value !== 'object') throw new Error('The options agent returned invalid JSON.')
  const candidate = value as { restatement?: unknown; options?: unknown }
  if (typeof candidate.restatement !== 'string' || !Array.isArray(candidate.options)) {
    throw new Error('The options agent response is missing restatement or options.')
  }
  if (candidate.options.length !== 3) throw new Error('The options agent must return exactly three options.')
  const ids = ['A', 'B', 'C'] as const
  const options = candidate.options.map((option, index) => {
    if (!option || typeof option !== 'object') throw new Error('The options agent returned an invalid option.')
    const record = option as Record<string, unknown>
    if (
      record.id !== ids[index] ||
      typeof record.title !== 'string' ||
      typeof record.description !== 'string'
    ) {
      throw new Error(`Option ${ids[index]} is invalid.`)
    }
    return {
      id: ids[index],
      title: record.title.trim(),
      description: record.description.trim(),
    }
  }) as [DecisionOption, DecisionOption, DecisionOption]
  return { restatement: candidate.restatement.trim(), options }
}

function parseAgentOutput(content: string): {
  restatement: string
  options: [DecisionOption, DecisionOption, DecisionOption]
} {
  const json = content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
  return validateOptions(JSON.parse(json) as unknown)
}

function getInput(input: OptionsRequest): { scenario: string; prompt: string } {
  if (input.caseId === 'custom') {
    return { scenario: input.customScenario ?? '', prompt: customPrompt[input.language] }
  }
  const definition = cases[input.caseId]
  return {
    scenario: definition.scenario[input.language],
    prompt: definition.prompt[input.language],
  }
}

export function createMockOptions(input: OptionsRequest): OptionsResult {
  const { scenario, prompt } = getInput(input)
  return {
    scenario,
    prompt,
    restatement: prompt,
    options:
      input.caseId === 'custom'
        ? customOptions[input.language]
        : cases[input.caseId].options[input.language],
    isMock: true,
  }
}

export async function generateOptions(
  config: AppConfig,
  input: OptionsRequest,
): Promise<OptionsResult> {
  if (config.provider === 'mock') return createMockOptions(input)
  if (!config.projectEndpoint) throw new Error('Foundry project endpoint is not configured.')

  const { scenario, prompt } = getInput(input)
  const project = new AIProjectClient(config.projectEndpoint, new DefaultAzureCredential())
  const agent = await project.agents.get(config.optionsAgentName)
  if (!agent.agent_endpoint) {
    throw new Error(`Prompt agent "${config.optionsAgentName}" has no agent endpoint.`)
  }
  const openai = project.getOpenAIClient({
    azureConfig: { allowPreview: true, agentName: config.optionsAgentName },
  })
  const conversation = await openai.conversations.create({
    items: [
      {
        type: 'message',
        role: 'user',
        content: JSON.stringify({
          language: input.language,
          caseId: input.caseId,
          scenario,
          attendeePrompt: prompt,
        }),
      },
    ],
  })

  try {
    let response = await openai.responses.create({ conversation: conversation.id })
    let content = response.output_text?.trim()
    if (!content) throw new Error('The options agent returned no content.')
    let result
    try {
      result = parseAgentOutput(content)
    } catch (outputError) {
      await openai.conversations.items.create(conversation.id, {
        items: [
          {
            type: 'message',
            role: 'user',
            content:
              'Your previous response did not match the required JSON schema. Return only corrected, valid JSON with restatement and exactly three options labelled A, B, and C.',
          },
        ],
      })
      response = await openai.responses.create({ conversation: conversation.id })
      content = response.output_text?.trim()
      if (!content) throw new Error('The options agent returned no content after schema correction.')
      try {
        result = parseAgentOutput(content)
      } catch {
        throw new Error(
          `The options agent returned invalid structured output twice: ${
            outputError instanceof Error ? outputError.message : 'unknown validation error'
          }`,
        )
      }
    }
    return { scenario, prompt, ...result, isMock: false }
  } finally {
    await openai.conversations.delete(conversation.id)
  }
}
