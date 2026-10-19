import { config as loadEnv } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(currentDirectory, '..', '..', '.env') })

export type ModelProvider = 'mock' | 'foundry'

export interface AppConfig {
  provider: ModelProvider
  projectEndpoint?: string
  resourceEndpoint?: string
  optionsAgentName: string
  optionsModelDeployment: string
  compareAgentName: string
  compareModelDeployment: string
  decisionDeployment: string
}

export function getConfig(): AppConfig {
  const provider = process.env.MODEL_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'foundry' : 'mock')
  if (provider !== 'mock' && provider !== 'foundry') throw new Error('Invalid MODEL_PROVIDER.')
  if (process.env.NODE_ENV === 'production' && provider !== 'foundry' && process.env.DEPLOYMENT_SMOKE !== 'true') {
    throw new Error('Production requires live Foundry.')
  }
  if (process.env.WORKSHOP_ENDS_AT && (!process.env.WORKSHOP_ENDS_AT.endsWith('Z') || !Number.isFinite(Date.parse(process.env.WORKSHOP_ENDS_AT)))) {
    throw new Error('WORKSHOP_ENDS_AT must be a valid UTC timestamp ending in Z.')
  }
  if (process.env.WORKSHOP_CLOSED && !['true', 'false'].includes(process.env.WORKSHOP_CLOSED)) throw new Error('Invalid WORKSHOP_CLOSED.')
  const config: AppConfig = {
    provider,
    optionsAgentName: process.env.FOUNDRY_OPTIONS_AGENT_NAME ?? 'decision-options-agent',
    optionsModelDeployment: process.env.FOUNDRY_OPTIONS_MODEL_DEPLOYMENT ?? 'gpt-5-mini',
    compareAgentName: process.env.FOUNDRY_COMPARE_AGENT_NAME ?? 'decision-compare-agent',
    compareModelDeployment: process.env.FOUNDRY_COMPARE_MODEL_DEPLOYMENT ?? 'gpt-5-mini',
    decisionDeployment: process.env.FOUNDRY_DECISION_DEPLOYMENT ?? 'decision-ranker',
  }

  if (provider === 'foundry') {
    const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.replace(/\/$/, '')
    const resourceEndpoint = process.env.FOUNDRY_RESOURCE_ENDPOINT?.replace(/\/$/, '')
    if (!projectEndpoint || !resourceEndpoint) {
      throw new Error(
        'Foundry mode requires FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_RESOURCE_ENDPOINT.',
      )
    }
    config.projectEndpoint = projectEndpoint
    config.resourceEndpoint = resourceEndpoint
  }

  return config
}
