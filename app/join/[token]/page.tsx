'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  member: 'Membre',
  contributeur: 'Contributeur',
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login_required'>('loading')
  const [message, setMessage] = useState('')
  const [wsName, setWsName] = useState('')
  const [role, setRole] = useState('')

  useEffect(() => {
    if (!token) return

    async function processInvite() {
      const supabase = createClient()

      // Check auth
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Store token in sessionStorage and redirect to login
        sessionStorage.setItem('pending_invite_token', token)
        setStatus('login_required')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      // Fetch invite
      const { data: invite, error: fetchErr } = await supabase
        .from('workspace_invites')
        .select('*, workspaces(name, company_id)')
        .eq('token', token)
        .eq('used', false)
        .maybeSingle()

      if (fetchErr || !invite) {
        setStatus('error')
        setMessage("Ce lien d'invitation est invalide ou expiré.")
        return
      }

      if (new Date(invite.expires_at) < new Date()) {
        setStatus('error')
        setMessage("Ce lien d'invitation a expiré.")
        return
      }

      const ws = (invite as { workspaces: { name: string; company_id: string } | null }).workspaces
      if (!ws) {
        setStatus('error')
        setMessage("L'espace de travail n'existe plus.")
        return
      }

      setWsName(ws.name)
      setRole(invite.role)

      // Ensure user has a company association
      const { data: userRow } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!userRow?.company_id) {
        // Set company from workspace
        await supabase
          .from('users')
          .update({ company_id: ws.company_id, is_active: true })
          .eq('id', user.id)
      }

      // Add to workspace_members (upsert to avoid duplicates)
      const { error: wmErr } = await supabase
        .from('workspace_members')
        .upsert({
          workspace_id: invite.workspace_id,
          user_id: user.id,
          role: invite.role,
          is_active: true,
        }, { onConflict: 'workspace_id,user_id' })

      if (wmErr) {
        setStatus('error')
        setMessage("Erreur lors de l'ajout à l'espace.")
        return
      }

      // Mark invite as used
      await supabase
        .from('workspace_invites')
        .update({ used: true })
        .eq('token', token)

      // Notify workspace admins
      fetch('/api/notifications/invite-accepted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: invite.workspace_id, workspaceName: ws.name }),
      }).catch(() => {})

      setStatus('success')
      setTimeout(() => router.push('/app/dashboard'), 2500)
    }

    processInvite()
  }, [token, router])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#F8FAFC' }}
    >
      <div className="mb-10">
        <Image src="/logo.png" alt="Maimoo" width={120} height={32} />
      </div>

      <div
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center text-center bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
      >
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h1 className="text-lg font-semibold text-[#0F172A] mb-2">Vérification du lien…</h1>
            <p className="text-sm text-[#94A3B8]">Patientez un instant.</p>
          </>
        )}

        {status === 'login_required' && (
          <>
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <span className="text-2xl">🔑</span>
            </div>
            <h1 className="text-lg font-semibold text-[#0F172A] mb-2">Connexion requise</h1>
            <p className="text-sm text-[#94A3B8]">Redirection vers la page de connexion…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <h1 className="text-lg font-semibold text-[#0F172A] mb-2">Vous avez rejoint l'espace !</h1>
            <p className="text-sm text-[#94A3B8] mb-1">
              <span className="font-medium text-[#1E293B]">{wsName}</span>
            </p>
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full mt-1"
              style={{
                background: role === 'admin' ? '#DBEAFE' : role === 'contributeur' ? '#FEF9C3' : '#DCFCE7',
                color: role === 'admin' ? '#2563EB' : role === 'contributeur' ? '#CA8A04' : '#16A34A',
              }}
            >
              {ROLE_LABELS[role] ?? role}
            </span>
            <p className="text-sm text-[#94A3B8] mt-4">Redirection en cours…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mb-4" />
            <h1 className="text-lg font-semibold text-[#0F172A] mb-2">Lien invalide</h1>
            <p className="text-sm text-[#94A3B8] mb-6">{message}</p>
            <button
              onClick={() => router.push('/app/dashboard')}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Retour à l'accueil
            </button>
          </>
        )}
      </div>
    </div>
  )
}
