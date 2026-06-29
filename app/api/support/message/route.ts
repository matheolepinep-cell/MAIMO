import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { Resend } from 'resend'

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  suggestion: 'Suggestion',
  question: 'Question',
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
  const { error: dbError } = await supabase.from('support_messages').insert({
    message,
    category,
    user_name: userName,
    user_email: userEmail,
  })

  if (dbError) {
    console.error('[SUPPORT] DB insert error:', dbError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const resendKey = process.env.RESEND_API_KEY
  const supportEmail = process.env.SUPPORT_EMAIL

  if (resendKey && supportEmail) {
    const resend = new Resend(resendKey)
    const categoryLabel = CATEGORY_LABELS[category] ?? category

    const { error: emailError } = await resend.emails.send({
      from: 'Maimoo Support <contact@maimoo.fr>',
      to: supportEmail,
      subject: `[Support] ${categoryLabel} — ${userName}`,
      replyTo: userEmail,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #2563EB; margin: 0 0 20px 0;">
            Nouveau message de support
          </h2>
          <table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #E5E7EB;">
            <tr style="background: #F9FAFB;">
              <td style="padding: 12px 16px; color: #6B7280; font-size: 13px; width: 120px;">Catégorie</td>
              <td style="padding: 12px 16px; font-weight: 600; font-size: 13px;">${categoryLabel}</td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; color: #6B7280; font-size: 13px;">Utilisateur</td>
              <td style="padding: 12px 16px; font-size: 13px;">${userName}</td>
            </tr>
            <tr style="background: #F9FAFB;">
              <td style="padding: 12px 16px; color: #6B7280; font-size: 13px;">Email</td>
              <td style="padding: 12px 16px; font-size: 13px;">
                <a href="mailto:${userEmail}" style="color: #2563EB;">${userEmail}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; color: #6B7280; font-size: 13px; vertical-align: top;">Message</td>
              <td style="padding: 12px 16px; font-size: 13px; line-height: 1.6;">${message}</td>
            </tr>
          </table>
          <div style="margin-top: 16px; padding: 12px 16px; background: #EFF6FF; border-radius: 8px; font-size: 12px; color: #6B7280;">
            Cliquez sur "Répondre" pour répondre directement à l'utilisateur.
          </div>
          <p style="margin-top: 20px; font-size: 11px; color: #9CA3AF; text-align: center;">
            Maimoo Support · maimoo.fr
          </p>
        </div>
      `,
    })

    if (emailError) {
      console.error('[SUPPORT] Email send error:', emailError.message)
    }
  } else {
    console.log(
      `[SUPPORT] ${CATEGORY_LABELS[category] ?? category} de ${userName} (${userEmail}): ${message}`,
    )
  }

  return NextResponse.json({ success: true })
}
