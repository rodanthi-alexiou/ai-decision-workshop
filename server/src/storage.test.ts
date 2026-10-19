import assert from 'node:assert/strict'
import { it } from 'node:test'
import { TableClient } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'
import { AzureStore, Conflict, statusOf } from './store.js'

it('refuses invalid partitions and purging an active open or unknown event', async () => {
  assert.throws(() => new AzureStore('https://invalid.table.core.windows.net', "invalid'partition"), /Invalid workshop partition/)
  const previousEvent = process.env.WORKSHOP_EVENT_ID
  const previousClosed = process.env.WORKSHOP_CLOSED
  try {
    process.env.WORKSHOP_EVENT_ID = 'active-test'
    process.env.WORKSHOP_CLOSED = 'false'
    const store = new AzureStore('https://invalid.table.core.windows.net', 'active-test')
    await assert.rejects(store.purgeEvent(), /Close or switch/)
    delete process.env.WORKSHOP_EVENT_ID
    await assert.rejects(store.purgeEvent(), /not configured/)
  } finally {
    if (previousEvent === undefined) delete process.env.WORKSHOP_EVENT_ID
    else process.env.WORKSHOP_EVENT_ID = previousEvent
    if (previousClosed === undefined) delete process.env.WORKSHOP_CLOSED
    else process.env.WORKSHOP_CLOSED = previousClosed
  }
})

it('proves real Azure Table ETag conflicts and atomic transaction rollback', {
  skip: !process.env.AZURE_TABLE_TEST_ENDPOINT,
}, async () => {
  const endpoint = process.env.AZURE_TABLE_TEST_ENDPOINT!
  const partition = `integration-${crypto.randomUUID()}`
  const store = new AzureStore(endpoint, partition)
  const client = new TableClient(endpoint, 'workshop', new DefaultAzureCredential())
  try {
    await store.ready()
    await store.commit([{ key: 'counter', value: { count: 0 } }])
    const initial = (await store.get<{ count: number }>('counter'))!
    await store.commit([{ key: 'counter', version: initial.version, value: { count: 1 } }])
    await assert.rejects(store.commit([
      { key: 'counter', version: initial.version, value: { count: 100 } },
      { key: 'must-not-exist', value: { created: true } },
    ]), Conflict)
    assert.equal(await store.get('must-not-exist'), undefined)
    assert.equal((await store.get<{ count: number }>('counter'))!.value.count, 1)
    const current = (await store.get('counter'))!
    const contenders = await Promise.allSettled(Array.from({ length: 5 }, () => store.commit([
      { key: 'counter', version: current.version, value: { count: 2 } },
    ])))
    assert.equal(contenders.filter(result => result.status === 'fulfilled').length, 1)
    for (const result of contenders) {
      if (result.status === 'rejected') assert.ok(result.reason instanceof Conflict)
    }
    await store.commit([
      { key: 'expired', value: { expires: Date.now() - 1000 } },
      { key: 'future', value: { expires: Date.now() + 86_400_000 } },
    ])
    assert.equal((await store.purgeExpired()).removed, 1)
    assert.ok(await store.get('counter'))
    assert.ok(await store.get('future'))
    assert.equal((await store.purgeEvent()).removed, 2)
    assert.equal(await store.get('counter'), undefined)
  } finally {
    for (const key of ['counter', 'must-not-exist', 'expired', 'future']) {
      try { await client.deleteEntity(partition, key) } catch (error) {
        if (statusOf(error) !== 404) throw error
      }
    }
  }
})
