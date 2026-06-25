import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { logAction } from '@/lib/audit'

function adminClient() {
  return createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await adminClient()
    .from('users')
    .select('onboarding_completed, onboarding_steps_completed')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    completed: data?.onboarding_completed ?? false,
    stepsCompleted: (data?.onboarding_steps_completed as number[] | null) ?? [],
  })
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = adminClient()

  // Mark as fully completed (dismiss)
  if (body.completed === true) {
    await supabase.from('users').update({ onboarding_completed: true }).eq('id', user.id)
    return NextResponse.json({ ok: true })
  }

  // Add a step completion (idempotent)
  if (typeof body.step === 'number') {
    const { data } = await supabase
      .from('users')
      .select('onboarding_steps_completed')
      .eq('id', user.id)
      .single()

    const current: number[] = (data?.onboarding_steps_completed as number[] | null) ?? []
    if (!current.includes(body.step)) {
      const next = [...current, body.step]
      const updates: Record<string, unknown> = { onboarding_steps_completed: next }
      if (next.length >= 3) updates.onboarding_completed = true
      await supabase.from('users').update(updates).eq('id', user.id)
    }
    return NextResponse.json({ ok: true })
  }

  // Log step click for audit (fire-and-forget from client)
  if (typeof body.step_click === 'number') {
    logAction({
      userId: user.id,
      action: 'onboarding.step_clicked',
      metadata: { step: body.step_click },
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
}
