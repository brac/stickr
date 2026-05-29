import { supabase } from './supabase'
import { getErrorMessage } from './errors'

// 'household_deleted' — the caller was the only parent, so the whole household
// (kids, boards, history, storage) was torn down.
// 'self_removed' — the caller left a household that still has another parent.
export type DeleteAccountOutcome = 'household_deleted' | 'self_removed'

interface DeleteAccountResponse {
  outcome?: DeleteAccountOutcome
  error?: string
}

// Permanently deletes the signed-in parent's account via the delete-account
// Edge Function (auth-user deletion needs the service role). The caller is
// resolved server-side from the session JWT. After this resolves, sign the user
// out — their session is now backed by a deleted account.
export async function deleteAccount(): Promise<DeleteAccountOutcome> {
  const { data, error } = await supabase.functions.invoke<DeleteAccountResponse>(
    'delete-account',
    { method: 'POST' },
  )

  if (error) {
    throw new Error(getErrorMessage(error))
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  if (!data?.outcome) {
    throw new Error('Account deletion did not complete. Please try again.')
  }
  return data.outcome
}
