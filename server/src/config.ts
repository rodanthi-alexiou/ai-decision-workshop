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
  const provider = process.env.MODEL_PROVIDER === 'foundry' ? 'foundry' : 'mock'
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
