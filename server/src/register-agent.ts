import { AIProjectClient } from '@azure/ai-projects'
import { DefaultAzureCredential } from '@azure/identity'
import { getConfig } from './config.js'
import { readAgentInstructions } from './options-agent.js'
import { readCompareInstructions } from './compare-agent.js'

const config = getConfig()
if (config.provider !== 'foundry' || !config.projectEndpoint) {
  throw new Error('Set MODEL_PROVIDER=foundry and configure the Foundry endpoints first.')
}

const project = new AIProjectClient(config.projectEndpoint, new DefaultAzureCredential())
const [optionsInstructions, compareInstructions] = await Promise.all([
  readAgentInstructions(),
  readCompareInstructions(),
])
const [optionsAgent, compareAgent] = await Promise.all([
  project.agents.createVersion(config.optionsAgentName, {
    kind: 'prompt',
    model: config.optionsModelDeployment,
    instructions: optionsInstructions,
  }),
  project.agents.createVersion(config.compareAgentName, {
    kind: 'prompt',
    model: config.compareModelDeployment,
    instructions: compareInstructions,
  }),
])

console.log(
  JSON.stringify(
    [
      {
        name: optionsAgent.name,
        version: optionsAgent.version,
        id: optionsAgent.id,
        model: config.optionsModelDeployment,
      },
      {
        name: compareAgent.name,
        version: compareAgent.version,
        id: compareAgent.id,
        model: config.compareModelDeployment,
      },
    ],
    null,
    2,
  ),
)
