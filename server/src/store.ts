import { TableClient, type TransactionAction } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'

export interface Row<T> { value: T; version: string }
export interface Write { key: string; value: unknown; version?: string }
export interface Store {
  get<T>(key: string): Promise<Row<T> | undefined>
  commit(writes: Write[]): Promise<void>
  ready(): Promise<void>
}

export function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    return typeof error.statusCode === 'number' ? error.statusCode : undefined
  }
  return undefined
}

export class Conflict extends Error {}

export class MemoryStore implements Store {
  private rows = new Map<string, Row<unknown>>()
  async ready() {}
  async get<T>(key: string): Promise<Row<T> | undefined> {
    return structuredClone(this.rows.get(key)) as Row<T> | undefined
  }
  async commit(writes: Write[]) {
    for (const write of writes) {
      if (this.rows.get(write.key)?.version !== write.version) throw new Conflict()
    }
    for (const write of writes) {
      this.rows.set(write.key, { value: structuredClone(write.value), version: crypto.randomUUID() })
    }
  }
}

export class AzureStore implements Store {
  private client: TableClient
  constructor(endpoint: string, private partition: string, table = 'workshop') {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(partition)) throw new Error('Invalid workshop partition.')
    this.client = new TableClient(endpoint, table, new DefaultAzureCredential(), {
      retryOptions: { maxRetries: 2 },
    })
  }
  async ready() {
    await this.client.listEntities({ queryOptions: { filter: `PartitionKey eq '${this.partition}'` } }).byPage({ maxPageSize: 1 }).next()
  }
  async get<T>(key: string): Promise<Row<T> | undefined> {
    try {
      const row = await this.client.getEntity<{ payload: string }>(this.partition, key)
      if (!row.etag) throw new Error('Storage response is missing its version.')
      return { value: JSON.parse(row.payload) as T, version: row.etag }
    } catch (error) {
      if (statusOf(error) === 404 && !(error instanceof Error && 'code' in error && error.code === 'TableNotFound')) return undefined
      throw error
    }
  }
  async commit(writes: Write[]) {
    const actions: TransactionAction[] = writes.map((write) => {
      const payload = JSON.stringify(write.value)
      if (Buffer.byteLength(payload, 'utf16le') > 60_000) throw new Error('Workshop record exceeds storage limits.')
      const entity = { partitionKey: this.partition, rowKey: write.key, payload }
      return write.version
        ? ['update', entity, 'Replace', { etag: write.version }]
        : ['create', entity]
    })
    try {
      await this.client.submitTransaction(actions)
    } catch (error) {
      if (statusOf(error) === 409 || statusOf(error) === 412) throw new Conflict()
      throw error
    }
  }
  async purgeExpired(now = Date.now()) {
    return this.purge(false, now)
  }
  async purgeEvent() {
    if (!process.env.WORKSHOP_EVENT_ID) throw new Error('Active workshop event is not configured.')
    if (this.partition === process.env.WORKSHOP_EVENT_ID && process.env.WORKSHOP_CLOSED !== 'true') {
      throw new Error('Close or switch the active event before purging it.')
    }
    return this.purge(true, Date.now())
  }
  private async purge(all: boolean, now: number) {
    let removed = 0
    for await (const entity of this.client.listEntities<{ payload: string }>({
      queryOptions: { filter: `PartitionKey eq '${this.partition}'` },
    })) {
      const value: unknown = JSON.parse(entity.payload)
      if (!all && !(value && typeof value === 'object' && 'expires' in value && typeof value.expires === 'number' && value.expires <= now)) continue
      if (!entity.rowKey || !entity.etag) throw new Error('Purge entity is missing its key or version.')
      await this.client.deleteEntity(this.partition, entity.rowKey, { etag: entity.etag })
      removed++
    }
    return { removed }
  }
}
