import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { env } from './env'

const LIMITS: Record<string, number> = {
  '/api/search': 50,
  '/api/notes/process': 30,
  '/api/notes/execute': 30,
  '/api/import/analyze': 20,
  '/api/import/analyze-batch': 20,
  '/api/import/analyze-document': 20,
  '/api/conflicts': 20,
  '/api/dashboard/briefing': 50,
  default: 30,
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
  workspaceId?: string | null
): Promise<{ limited: boolean; remaining: number; resetAt: Date }> {
  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)
  const limit = LIMITS[endpoint] ?? LIMITS.default
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('created_at', since)

  const used = count ?? 0
  const remaining = Math.max(0, limit - used)
  const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  if (used >= limit) {
    return { limited: true, remaining: 0, resetAt }
  }

  await supabase.from('api_usage').insert({
    user_id: userId,
    endpoint,
    workspace_id: workspaceId ?? null,
  })

  return { limited: false, remaining: remaining - 1, resetAt }
}
