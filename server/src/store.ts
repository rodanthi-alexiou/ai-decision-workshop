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
}
