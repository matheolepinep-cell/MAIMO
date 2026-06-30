import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { env } from './env'
import { generateActivitySummary } from './activity-summary'

export type AuditAction =
  | 'note.created'
  | 'note.deleted'
  | 'note.updated'
  | 'account.created'
  | 'account.deleted'
  | 'account.updated'
  | 'document.uploaded'
  | 'document.deleted'
  | 'search.query'
  | 'member.invited'
  | 'member.role_changed'
  | 'member.deactivated'
  | 'member.deleted'
  | 'message.deleted'
  | 'user.login'
  | 'onboarding.step_clicked'

interface LogActionParams {
  userId: string
  workspaceId?: string | null
  action: AuditAction
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)
    const { data } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      workspace_id: params.workspaceId ?? null,
      action: params.action,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      metadata: params.metadata ?? {},
    }).select('id').single()

    // Fire-and-forget AI summary for selected action types
    if (data?.id && params.resourceId) {
      if (params.action === 'note.created' || params.action === 'document.uploaded') {
        generateActivitySummary(data.id, params.resourceId, params.action).catch(() => {})
      }
    }
  } catch {
    // Audit logging failures must never break the main request
  }
}
