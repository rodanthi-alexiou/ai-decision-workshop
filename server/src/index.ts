import { buildApp } from './app.js'

const app = await buildApp()
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { void app.close() })
}
