import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const CATEGORY_LABELS: Record<string, string> = {
  bug: '🐛 Bug',
  suggestion: '💡 Suggestion',
  question: '❓ Question',
}

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const { message, category, userName, userEmail } = await request.json()

  if (!message || !category) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = adminClient()
  const { error } = await supabase.from('support_messages').insert({
    message,
    category,
    user_name: userName,
    user_email: userEmail,
  })

  if (error) {
    console.error('[SUPPORT] DB insert error:', error.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log(
    `[SUPPORT] ${CATEGORY_LABELS[category] ?? category} de ${userName} (${userEmail}): ${message}`,
  )

  return NextResponse.json({ success: true })
}
