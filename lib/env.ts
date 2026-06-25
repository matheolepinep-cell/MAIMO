/**
 * Server-only environment variable validation.
 * Import this in any API route that uses sensitive keys.
 * Throws at startup if a required variable is missing.
 */

const requiredServerEnvs = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

for (const key of requiredServerEnvs) {
  if (!process.env[key]) {
    throw new Error(`Variable d'environnement manquante : ${key}`)
  }
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  openaiApiKey: process.env.OPENAI_API_KEY ?? null,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.maimoo.fr',
}
