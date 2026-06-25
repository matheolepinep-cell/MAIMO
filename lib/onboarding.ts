export async function markOnboardingStep(step: number): Promise<void> {
  try {
    await fetch('/api/user/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('onboarding:step', { detail: { step } }))
    }
  } catch {
    // Non-critical — onboarding failures must never break the main flow
  }
}
