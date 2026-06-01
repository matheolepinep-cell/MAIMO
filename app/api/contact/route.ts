import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(request: Request) {
  const { name, email, message } = await request.json()

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Champs manquants.' }, { status: 400 })
  }

  try {
    await sendEmail({
      replyTo: email.trim(),
      subject: `Message de ${name.trim()} via Maimoo`,
      html: `
        <p><strong>Nom :</strong> ${name.trim()}</p>
        <p><strong>Email :</strong> ${email.trim()}</p>
        <p><strong>Message :</strong></p>
        <p style="white-space:pre-wrap">${message.trim()}</p>
      `,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Contact email error:', err)
    return NextResponse.json({ error: 'Erreur lors de l\'envoi.' }, { status: 500 })
  }
}
