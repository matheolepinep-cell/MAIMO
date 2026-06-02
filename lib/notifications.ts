import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

type NotifType = 'note_added' | 'document_added' | 'document_shared' | 'message_received' | 'company_updated'

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Returns the list of user_ids to notify for a given company (all team members except excludeUserId),
 *  filtering out users who have muted that company. */
export async function getNotifiableUsers(
  companyId: string,
  orgCompanyId: string,
  excludeUserId?: string
): Promise<string[]> {
  const supabase = adminClient()

  const [{ data: members }, { data: muted }] = await Promise.all([
    supabase
      .from('users')
      .select('id')
      .eq('company_id', orgCompanyId),
    supabase
      .from('muted_companies')
      .select('user_id')
      .eq('company_id', companyId),
  ])

  const mutedIds = new Set((muted ?? []).map((m: { user_id: string }) => m.user_id))

  return (members ?? [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => id !== excludeUserId && !mutedIds.has(id))
}

/** Creates a single notification row for a given user. */
export async function createNotification(
  userId: string,
  accountId: string | null,
  type: NotifType,
  title: string,
  body: string | null,
  data: Record<string, string> = {}
) {
  const supabase = adminClient()
  await supabase.from('notifications').insert({
    user_id: userId,
    account_id: accountId,
    type,
    title,
    body,
    data,
    read: false,
  })
}

/** Creates notifications for a list of users, checking muted_companies if accountId provided. */
export async function notifyTeam(
  userIds: string[],
  accountId: string | null,
  type: NotifType,
  title: string,
  body: string | null,
  data: Record<string, string> = {}
) {
  if (userIds.length === 0) return
  const supabase = adminClient()
  await supabase.from('notifications').insert(
    userIds.map((userId) => ({
      user_id: userId,
      account_id: accountId,
      type,
      title,
      body,
      data,
      read: false,
    }))
  )
}
