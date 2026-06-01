export async function sendEmail({
  replyTo,
  subject,
  html,
}: {
  replyTo?: string
  subject: string
  html: string
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Maimoo <contact@maimoo.fr>',
      to: ['contact@maimoo.fr'],
      reply_to: replyTo,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend error: ${text}`)
  }
}
