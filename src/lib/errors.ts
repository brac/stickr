export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return 'Something went wrong. Please try again.'
}

// Postgres/PostgREST error code (e.g. '23505' unique violation, '42501' RLS
// reject, 'P0001' raise exception). Supabase surfaces these on the error's
// `code` field; anything else returns undefined.
export function getPostgresErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}
