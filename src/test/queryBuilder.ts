import { vi } from 'vitest'

// A thenable stand-in for the Supabase PostgREST query builder. Every chain
// method returns the same builder, and the builder itself is awaitable —
// resolving to the supplied result no matter where in the chain you await
// (`.select().eq().order()` and `.insert().select().single()` both work).
export function queryResult<T>(result: T): Record<string, unknown> {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'neq',
    'is',
    'not',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]
  for (const method of methods) {
    builder[method] = vi.fn(chain)
  }
  builder.then = (
    onFulfilled: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}
