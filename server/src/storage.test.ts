import assert from 'node:assert/strict'
import { it } from 'node:test'
import { TableClient } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'
import { AzureStore, Conflict, statusOf } from './store.js'

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
  } finally {
    for (const key of ['counter', 'must-not-exist']) {
      try { await client.deleteEntity(partition, key) } catch (error) {
        if (statusOf(error) !== 404) throw error
      }
    }
  }
})
