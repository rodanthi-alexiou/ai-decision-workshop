import { WorkshopError } from './workshop.js'

export interface ModelOperation { signal: AbortSignal; beforeInference(): void }

export function assertOpen() {
  const end = process.env.WORKSHOP_ENDS_AT
  if (process.env.WORKSHOP_CLOSED === 'true' || (end && Date.now() >= Date.parse(end))) {
    throw new WorkshopError(403, 'WORKSHOP_CLOSED', 'The workshop has ended. Thank you for taking part.')
  }
}

export function operation(maxCalls: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  let calls = 0
  const context: ModelOperation = {
    signal: controller.signal,
    beforeInference() {
      assertOpen()
      controller.signal.throwIfAborted()
      if (++calls > maxCalls) throw new Error('Inference reservation exhausted.')
    },
  }
  return { context, close: () => clearTimeout(timeout) }
}
