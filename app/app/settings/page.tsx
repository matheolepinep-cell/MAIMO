'use client'

import { useEffect, useState, Suspense } from 'react'
import { Building2, User, LogOut, Palette, Layers, Settings2, CalendarDays, RefreshCw, CheckCircle2, XCircle, Shield } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal'
import { ManageWorkspaceModal } from '@/components/workspace/ManageWorkspaceModal'
import { isPasswordValid } from '@/lib/password-validation'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator'
import type { Company, Workspace } from '@/types/database'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local[0]}***@${domain}`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return phone.slice(0, 4) + ' ** ** ** ' + phone.slice(-2)
}

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile, loading: profileLoading, refresh: refreshProfile } = useUser()
  const { accentColor, setAccentColor } = useAccentColor()
  const { userWorkspaces, isSuperAdmin, wsId } = useWorkspace()
  const [company, setCompany] = useState<Company | null>(null)
  const [showCreateWs, setShowCreateWs] = useState(false)
  const [managingWs, setManagingWs] = useState<Workspace | null>(null)

  // Profile
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileMsgType, setProfileMsgType] = useState<'success' | 'error'>('success')

  // Company
  const [companyName, setCompanyName] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyMsg, setCompanyMsg] = useState('')
  const [companyMsgType, setCompanyMsgType] = useState<'success' | 'error'>('success')

  // Workspace company profile
  type WsProfile = {
    company_name: string; company_sector: string; company_description: string
    company_services: string; company_zone: string; company_clients_type: string
    company_values: string; company_differentiator: string
  }
  const [wsProfile, setWsProfile] = useState<WsProfile>({
    company_name: '', company_sector: '', company_description: '',
    company_services: '', company_zone: '', company_clients_type: '',
    company_values: '', company_differentiator: '',
  })
  const [savingWs, setSavingWs] = useState(false)
  const [wsMsg, setWsMsg] = useState('')
  const [wsMsgType, setWsMsgType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    if (!wsId) return
    const supabase = createClient()
    supabase
      .from('workspaces')
      .select('company_name, company_sector, company_description, company_services, company_zone, company_clients_type, company_values, company_differentiator')
      .eq('id', wsId)
      .single()
      .then(({ data }) => {
        if (data) setWsProfile({
          company_name: (data as Record<string, string | null>).company_name ?? '',
          company_sector: (data as Record<string, string | null>).company_sector ?? '',
          company_description: (data as Record<string, string | null>).company_description ?? '',
          company_services: (data as Record<string, string | null>).company_services ?? '',
          company_zone: (data as Record<string, string | null>).company_zone ?? '',
          company_clients_type: (data as Record<string, string | null>).company_clients_type ?? '',
          company_values: (data as Record<string, string | null>).company_values ?? '',
          company_differentiator: (data as Record<string, string | null>).company_differentiator ?? '',
        })
      })
  }, [wsId])

  useEffect(() => {
    if (profileLoading || !profile) return
    setFullName(profile.full_name)
    const supabase = createClient()
    supabase
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single()
      .then(({ data }) => {
        if (data) { setCompany(data); setCompanyName(data.name) }
      })
  }, [profileLoading, profile])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!fullName.trim()) { setProfileMsg('Veuillez entrer votre nom.'); setProfileMsgType('error'); return }
    setSavingProfile(true)
    setProfileMsg('')
    const supabase = createClient()
    const { error } = await supabase.from('users').update({ full_name: fullName.trim() }).eq('id', profile.id)
    setProfileMsgType(error ? 'error' : 'success')
    setProfileMsg(error ? error.message : 'Profil mis à jour !')
    setSavingProfile(false)
  }

  const handleSaveWs = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId || !isAdmin) return
    setSavingWs(true)
    setWsMsg('')
    const supabase = createClient()
    const { error } = await supabase.from('workspaces').update({
      company_name: wsProfile.company_name.trim() || null,
      company_sector: wsProfile.company_sector.trim() || null,
      company_description: wsProfile.company_description.trim() || null,
      company_services: wsProfile.company_services.trim() || null,
      company_zone: wsProfile.company_zone.trim() || null,
      company_clients_type: wsProfile.company_clients_type.trim() || null,
      company_values: wsProfile.company_values.trim() || null,
      company_differentiator: wsProfile.company_differentiator.trim() || null,
    }).eq('id', wsId)
    setWsMsgType(error ? 'error' : 'success')
    setWsMsg(error ? error.message : 'Fiche enregistrée !')
    setSavingWs(false)
  }

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !company || profile.role !== 'admin') return
    setSavingCompany(true)
    setCompanyMsg('')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('companies')
      .update({ name: companyName.trim() })
      .eq('id', company.id)
      .select()
      .single()
    if (!error && data) { setCompany(data); setCompanyMsgType('success'); setCompanyMsg('Nom mis à jour !') }
    else { setCompanyMsgType('error'); setCompanyMsg(error?.message ?? 'Erreur') }
    setSavingCompany(false)
  }

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setPwMsg('')
    setSavingPw(true)
    const supabase = createClient()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPwForPw })
    if (authErr) {
      setPwMsgType('error'); setPwMsg('Mot de passe actuel incorrect.'); setSavingPw(false); return
    }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwMsgType('error'); setPwMsg(error.message) }
    else {
      setPwMsgType('success'); setPwMsg('Mot de passe mis à jour !')
      setPwOpen(false); setCurrentPwForPw(''); setNewPw(''); setConfirmPw('')
    }
    setSavingPw(false)
  }

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setEmailMsg('')
    setSavingEmail(true)
    const supabase = createClient()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPwForEmail })
    if (authErr) {
      setEmailMsgType('error'); setEmailMsg('Mot de passe incorrect.'); setSavingEmail(false); return
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) { setEmailMsgType('error'); setEmailMsg(error.message) }
    else {
      setEmailMsgType('success'); setEmailMsg('Un email de confirmation a été envoyé à votre nouvelle adresse.')
      setCurrentPwForEmail(''); setNewEmail(''); setConfirmEmail('')
    }
    setSavingEmail(false)
  }

  const handleChangePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setPhoneMsg('')
    setSavingPhone(true)
    const supabase = createClient()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPwForPhone })
    if (authErr) {
      setPhoneMsgType('error'); setPhoneMsg('Mot de passe incorrect.'); setSavingPhone(false); return
    }
    const phone = newPhone.replace(/\s/g, '').trim() || null
    const { error } = await supabase.from('users').update({ phone }).eq('id', profile.id)
    if (error) { setPhoneMsgType('error'); setPhoneMsg(error.message) }
    else {
      setPhoneMsgType('success'); setPhoneMsg('Téléphone mis à jour !')
      setPhoneOpen(false); setCurrentPwForPhone(''); setNewPhone('')
      await refreshProfile()
    }
    setSavingPhone(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const isAdmin = profile?.role === 'admin'

  // Force profile refresh when OAuth redirects back with ?google=connected or disconnected
  useEffect(() => {
    const status = searchParams.get('google')
    if (status === 'connected' || status === 'disconnected') {
      refreshProfile()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Security blocks
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPwForPw, setCurrentPwForPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwFocused, setPwFocused] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwMsgType, setPwMsgType] = useState<'success' | 'error'>('success')

  const [emailOpen, setEmailOpen] = useState(false)
  const [currentPwForEmail, setCurrentPwForEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [emailMsgType, setEmailMsgType] = useState<'success' | 'error'>('success')

  const [phoneOpen, setPhoneOpen] = useState(false)
  const [currentPwForPhone, setCurrentPwForPhone] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneMsg, setPhoneMsg] = useState('')
  const [phoneMsgType, setPhoneMsgType] = useState<'success' | 'error'>('success')

  // Google Calendar
  const [calSyncing, setCalSyncing] = useState(false)
  const [calMsg, setCalMsg] = useState('')
  const [calMsgType, setCalMsgType] = useState<'success' | 'error'>('success')
  const googleStatus = searchParams.get('google')
  const calConnected = !!profile?.google_calendar_connected

  const handleCalSync = async () => {
    if (calSyncing) return
    setCalSyncing(true); setCalMsg('')
    try {
      const res = await fetch('/api/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const { synced, updated } = await res.json()
      setCalMsgType('success'); setCalMsg(`Synchronisé : ${synced} nouvel${synced !== 1 ? 's' : ''} événement${synced !== 1 ? 's' : ''}, ${updated} mis à jour`)
    } catch { setCalMsgType('error'); setCalMsg('Erreur lors de la synchronisation') }
    setCalSyncing(false)
  }

  return (
    <div>
      <Header title="Paramètres" />
      <div className="p-4 md:p-8 pb-24 md:pb-8 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-[#1E293B] hidden lg:block">Paramètres</h1>

        {/* Mon entreprise — workspace company profile */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-[#1E293B] text-sm">Mon entreprise</p>
              <p className="text-xs text-[#64748B]">Personnalise les réponses de l'IA à votre activité</p>
            </div>
          </div>

          {isAdmin ? (
            <form onSubmit={handleSaveWs} className="space-y-3">
              <Input id="ws_company_name" label="Nom de l'entreprise" value={wsProfile.company_name}
                onChange={(e) => setWsProfile(p => ({ ...p, company_name: e.target.value }))}
                placeholder="Entreprise Dupont" />
              <Input id="ws_company_sector" label="Secteur d'activité" value={wsProfile.company_sector}
                onChange={(e) => setWsProfile(p => ({ ...p, company_sector: e.target.value }))}
                placeholder="Maintenance industrielle" />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws_company_description" className="text-sm font-medium text-[#0F172A]">Description / Raison d'être</label>
                <textarea id="ws_company_description" rows={2} value={wsProfile.company_description}
                  onChange={(e) => setWsProfile(p => ({ ...p, company_description: e.target.value }))}
                  placeholder="Nous aidons les PME industrielles à réduire leurs arrêts machine"
                  className="w-full px-4 py-2.5 rounded-xl border text-[16px] md:text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(0,0,0,0.08)] focus:border-[#0A0A0A] transition-all duration-150"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws_company_services" className="text-sm font-medium text-[#0F172A]">Produits et services proposés</label>
                <textarea id="ws_company_services" rows={2} value={wsProfile.company_services}
                  onChange={(e) => setWsProfile(p => ({ ...p, company_services: e.target.value }))}
                  placeholder="Contrats de maintenance préventive, interventions curatives, formation opérateurs"
                  className="w-full px-4 py-2.5 rounded-xl border text-[16px] md:text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(0,0,0,0.08)] focus:border-[#0A0A0A] transition-all duration-150"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              <Input id="ws_company_zone" label="Zone géographique principale" value={wsProfile.company_zone}
                onChange={(e) => setWsProfile(p => ({ ...p, company_zone: e.target.value }))}
                placeholder="Grand Ouest France" />
              <Input id="ws_company_clients_type" label="Type de clients ciblés" value={wsProfile.company_clients_type}
                onChange={(e) => setWsProfile(p => ({ ...p, company_clients_type: e.target.value }))}
                placeholder="PME industrielles 50-500 salariés, responsables de production" />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws_company_values" className="text-sm font-medium text-[#0F172A]">Valeurs de l'entreprise</label>
                <textarea id="ws_company_values" rows={2} value={wsProfile.company_values}
                  onChange={(e) => setWsProfile(p => ({ ...p, company_values: e.target.value }))}
                  placeholder="Ex: Proximité client, réactivité, expertise technique, engagement qualité..."
                  className="w-full px-4 py-2.5 rounded-xl border text-[16px] md:text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(0,0,0,0.08)] focus:border-[#0A0A0A] transition-all duration-150"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws_company_differentiator" className="text-sm font-medium text-[#0F172A]">Argument différenciateur clé</label>
                <textarea id="ws_company_differentiator" rows={2} value={wsProfile.company_differentiator}
                  onChange={(e) => setWsProfile(p => ({ ...p, company_differentiator: e.target.value }))}
                  placeholder="Intervention garantie en moins de 4h, techniciens certifiés constructeur"
                  className="w-full px-4 py-2.5 rounded-xl border text-[16px] md:text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(0,0,0,0.08)] focus:border-[#0A0A0A] transition-all duration-150"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              {wsMsg && <FormMessage type={wsMsgType} message={wsMsg} />}
              <Button type="submit" loading={savingWs} size="sm" className="w-full md:w-auto">Sauvegarder</Button>
            </form>
          ) : (
            <div className="space-y-2">
              {[
                { label: "Nom de l'entreprise", value: wsProfile.company_name },
                { label: 'Secteur', value: wsProfile.company_sector },
                { label: 'Zone géographique', value: wsProfile.company_zone },
                { label: 'Valeurs', value: wsProfile.company_values },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label} className="flex gap-2 text-sm">
                  <span className="text-[#94A3B8] shrink-0 min-w-[140px]">{label}</span>
                  <span className="text-[#1E293B] font-medium">{value}</span>
                </div>
              ))}
              {!wsProfile.company_name && (
                <p className="text-sm text-[#94A3B8]">Fiche non renseignée par l'administrateur.</p>
              )}
            </div>
          )}
        </Card>

        {/* Company name — admin only */}
        {isAdmin && company && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <p className="font-semibold text-[#1E293B] text-sm">Mon espace</p>
            </div>
            <form onSubmit={handleSaveCompany} className="space-y-3">
              <Input id="companyName" label="Nom de l'espace" value={companyName}
                onChange={(e) => setCompanyName(e.target.value)} />
              <p className="text-xs text-[#94A3B8]">
                Créé le {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(company.created_at))}
              </p>
              {companyMsg && <FormMessage type={companyMsgType} message={companyMsg} />}
              <Button type="submit" loading={savingCompany} size="sm" className="w-full md:w-auto">Enregistrer</Button>
            </form>
          </Card>
        )}

        {/* Company info — commercial read-only */}
        {!isAdmin && company && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <p className="font-semibold text-[#1E293B] text-sm">Mon espace</p>
            </div>
            <p className="text-[#1E293B] font-medium">{company.name}</p>
          </Card>
        )}

        {/* Espaces — admin only */}
        {isAdmin && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-[#1E293B] text-sm">Espaces</p>
                  <p className="text-xs text-[#64748B]">{userWorkspaces.length} / 5 espace{userWorkspaces.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              {userWorkspaces.length < 5 && (
                <button
                  onClick={() => setShowCreateWs(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  + Créer
                </button>
              )}
            </div>

            <div className="space-y-2">
              {userWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: `#${ws.color}` }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1E293B] truncate">{ws.name}</p>
                    {ws.description && <p className="text-xs text-[#94A3B8] truncate">{ws.description}</p>}
                  </div>
                  {ws.is_default && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium shrink-0">
                      Principal
                    </span>
                  )}
                  {(ws.role === 'admin' || isSuperAdmin) && (
                    <button
                      onClick={() => setManagingWs(ws)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all shrink-0"
                      title="Gérer"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {showCreateWs && (
          <CreateWorkspaceModal open={showCreateWs} onClose={() => setShowCreateWs(false)} />
        )}
        {managingWs && (
          <ManageWorkspaceModal
            workspace={managingWs}
            onClose={() => setManagingWs(null)}
            onDeleted={() => setManagingWs(null)}
          />
        )}

        {/* Profile */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <User className="w-4 h-4 text-purple-600" />
            </div>
            <p className="font-semibold text-[#1E293B] text-sm">Mon profil</p>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Input id="fullName" label="Nom complet" value={fullName}
              onChange={(e) => setFullName(e.target.value)} />
            <Input id="email" label="Email" value={profile?.email ?? ''} disabled
              className="bg-gray-50 text-[#94A3B8]" />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              profile?.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
            }`}>
              {profile?.role === 'admin' ? 'Admin' : 'Collaborateur'}
            </span>
            {profileMsg && <FormMessage type={profileMsgType} message={profileMsg} />}
            <Button type="submit" loading={savingProfile} size="sm" className="w-full md:w-auto">Enregistrer</Button>
          </form>
        </Card>

        {/* Security & Personal Info */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
              <Shield className="w-4 h-4 text-slate-600" />
            </div>
            <div>
              <p className="font-semibold text-[#1E293B] text-sm">Sécurité &amp; Informations personnelles</p>
              <p className="text-xs text-[#64748B]">Gérez vos accès et coordonnées</p>
            </div>
          </div>

          {!profile?.phone && (
            <div className="mb-4 px-3 py-2.5 rounded-xl text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
              💡 Ajoutez un numéro de téléphone pour faciliter votre identification.
            </div>
          )}

          <div className="divide-y divide-[#F1F5F9]">
            {/* Block 1: Password */}
            <div className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#6B7280]">Mot de passe</p>
                  <p className="text-sm font-medium text-[#0A0A0A] mt-0.5">••••••••</p>
                </div>
                <button
                  onClick={() => { setPwOpen(v => !v); setPwMsg('') }}
                  className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors shrink-0 ml-4"
                >
                  {pwOpen ? 'Annuler' : 'Modifier'}
                </button>
              </div>
              {pwOpen && (
                <form onSubmit={handleChangePw} className="mt-4 space-y-3">
                  <Input id="sec-current-pw" type="password" label="Mot de passe actuel" placeholder="••••••••"
                    value={currentPwForPw} onChange={(e) => setCurrentPwForPw(e.target.value)} autoComplete="current-password" />
                  <div>
                    <Input id="sec-new-pw" type="password" label="Nouveau mot de passe" placeholder="••••••••"
                      value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password"
                      onFocus={() => setPwFocused(true)} onBlur={() => setPwFocused(false)} />
                    <PasswordStrengthIndicator password={newPw} focused={pwFocused} />
                  </div>
                  <Input id="sec-confirm-pw" type="password" label="Confirmer le mot de passe" placeholder="••••••••"
                    value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
                  {confirmPw.length > 0 && newPw !== confirmPw && (
                    <p className="text-xs text-red-500">Les mots de passe ne correspondent pas.</p>
                  )}
                  {pwMsg && <FormMessage type={pwMsgType} message={pwMsg} />}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="submit" loading={savingPw} size="sm"
                      disabled={savingPw || !currentPwForPw || !isPasswordValid(newPw) || newPw !== confirmPw}>
                      Enregistrer
                    </Button>
                    <button type="button"
                      onClick={() => { setPwOpen(false); setPwMsg(''); setCurrentPwForPw(''); setNewPw(''); setConfirmPw('') }}
                      className="text-sm text-[#6B7280] hover:text-[#374151] transition-colors px-3 py-2 text-left">
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Block 2: Email */}
            <div className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#6B7280]">Adresse email</p>
                  <p className="text-sm font-medium text-[#0A0A0A] mt-0.5">{profile?.email ? maskEmail(profile.email) : '—'}</p>
                </div>
                <button
                  onClick={() => { setEmailOpen(v => !v); setEmailMsg('') }}
                  className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors shrink-0 ml-4"
                >
                  {emailOpen ? 'Annuler' : 'Modifier'}
                </button>
              </div>
              {emailOpen && (
                <form onSubmit={handleChangeEmail} className="mt-4 space-y-3">
                  <Input id="sec-current-pw-email" type="password" label="Mot de passe actuel" placeholder="••••••••"
                    value={currentPwForEmail} onChange={(e) => setCurrentPwForEmail(e.target.value)} autoComplete="current-password" />
                  <Input id="sec-new-email" type="email" label="Nouvel email" placeholder="nouveau@exemple.com"
                    value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email"
                    onInvalid={(e) => e.preventDefault()} />
                  <Input id="sec-confirm-email" type="email" label="Confirmer l'email" placeholder="nouveau@exemple.com"
                    value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="email"
                    onInvalid={(e) => e.preventDefault()} />
                  {confirmEmail.length > 0 && newEmail !== confirmEmail && (
                    <p className="text-xs text-red-500">Les adresses email ne correspondent pas.</p>
                  )}
                  {emailMsg && <FormMessage type={emailMsgType} message={emailMsg} />}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="submit" loading={savingEmail} size="sm"
                      disabled={savingEmail || !currentPwForEmail || !newEmail.trim() || newEmail !== confirmEmail}>
                      Enregistrer
                    </Button>
                    <button type="button"
                      onClick={() => { setEmailOpen(false); setEmailMsg(''); setCurrentPwForEmail(''); setNewEmail(''); setConfirmEmail('') }}
                      className="text-sm text-[#6B7280] hover:text-[#374151] transition-colors px-3 py-2 text-left">
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Block 3: Phone */}
            <div className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#6B7280]">Téléphone</p>
                  <p className="text-sm font-medium text-[#0A0A0A] mt-0.5">
                    {profile?.phone ? maskPhone(profile.phone) : <span className="text-[#94A3B8]">Non renseigné</span>}
                  </p>
                </div>
                <button
                  onClick={() => { setPhoneOpen(v => !v); setPhoneMsg('') }}
                  className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors shrink-0 ml-4"
                >
                  {phoneOpen ? 'Annuler' : profile?.phone ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
              {phoneOpen && (
                <form onSubmit={handleChangePhone} className="mt-4 space-y-3">
                  <Input id="sec-current-pw-phone" type="password" label="Mot de passe actuel" placeholder="••••••••"
                    value={currentPwForPhone} onChange={(e) => setCurrentPwForPhone(e.target.value)} autoComplete="current-password" />
                  <Input id="sec-new-phone" type="tel" label="Numéro de téléphone" placeholder="+33 6 12 34 56 78"
                    value={newPhone} onChange={(e) => setNewPhone(e.target.value)} autoComplete="tel" />
                  {phoneMsg && <FormMessage type={phoneMsgType} message={phoneMsg} />}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="submit" loading={savingPhone} size="sm"
                      disabled={savingPhone || !currentPwForPhone}>
                      Enregistrer
                    </Button>
                    <button type="button"
                      onClick={() => { setPhoneOpen(false); setPhoneMsg(''); setCurrentPwForPhone(''); setNewPhone('') }}
                      className="text-sm text-[#6B7280] hover:text-[#374151] transition-colors px-3 py-2 text-left">
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </Card>

        {/* Accent color */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}20` }}>
              <Palette className="w-4 h-4" style={{ color: accentColor }} />
            </div>
            <div>
              <p className="font-semibold text-[#1E293B] text-sm">Couleur d'accent</p>
              <p className="text-xs text-[#64748B]">Avatars et indicateurs de statut</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2 flex-wrap">
              {['#0A0A0A', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#0A0A0A'].map((c) => (
                <button
                  key={c}
                  onClick={() => setAccentColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-all duration-150 hover:scale-110"
                  style={{
                    background: c,
                    borderColor: accentColor === c ? '#0F172A' : 'transparent',
                    boxShadow: accentColor === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent p-0"
                title="Couleur personnalisée"
              />
              <span className="text-xs text-[#64748B]">Personnalisé</span>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: accentColor }}>AB</div>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ background: 'rgba(0,0,0,0.12)', color: '#0A0A0A', borderColor: 'rgba(30,39,97,0.2)' }}>Client</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(30,39,97,0.5)', borderColor: 'rgba(30,39,97,0.1)' }}>Prospect</span>
            <span className="text-xs text-[#94A3B8] ml-1">Aperçu</span>
          </div>
        </Card>

        {/* Integrations */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#F5F5F5' }}>
              <CalendarDays className="w-4 h-4" style={{ color: '#0A0A0A' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#0A0A0A' }}>Intégrations</p>
              <p className="text-xs" style={{ color: '#6B6B6B' }}>Connectez vos outils externes</p>
            </div>
          </div>

          {/* Google Calendar card */}
          <div className="rounded-xl p-4" style={{ border: '1px solid #E5E5E5', background: '#FAFAFA' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff', border: '1px solid #E5E5E5' }}>
                  <CalendarDays className="w-5 h-5" style={{ color: '#0A0A0A' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Google Calendar</p>
                  <p className="text-xs" style={{ color: '#6B6B6B' }}>
                    {calConnected ? 'Synchronisation bidirectionnelle activée' : 'Synchronisez vos RDV automatiquement'}
                  </p>
                </div>
              </div>
              {calConnected
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#16A34A' }} />
                : <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#9B9B9B' }} />}
            </div>

            {googleStatus === 'connected' && !calMsg && (
              <p className="mt-3 text-xs font-medium" style={{ color: '#16A34A' }}>Google Calendar connecté avec succès !</p>
            )}
            {googleStatus === 'disconnected' && !calMsg && (
              <p className="mt-3 text-xs font-medium" style={{ color: '#6B6B6B' }}>Google Calendar déconnecté.</p>
            )}
            {googleStatus === 'error' && !calMsg && (
              <p className="mt-3 text-xs font-medium" style={{ color: '#DC2626' }}>Erreur lors de la connexion. Réessayez.</p>
            )}
            {calMsg && <p className="mt-3 text-xs font-medium" style={{ color: calMsgType === 'success' ? '#16A34A' : '#DC2626' }}>{calMsg}</p>}

            <div className="flex gap-2 mt-3">
              {calConnected ? (
                <>
                  <button onClick={handleCalSync} disabled={calSyncing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-all"
                    style={{ background: '#0A0A0A' }}>
                    <RefreshCw className={`w-3.5 h-3.5 ${calSyncing ? 'animate-spin' : ''}`} />
                    {calSyncing ? 'Sync…' : 'Synchroniser maintenant'}
                  </button>
                  <a href="/api/auth/google/disconnect"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FEE2E2' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2' }}>
                    Déconnecter
                  </a>
                </>
              ) : (
                <a href="/api/auth/google"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                  style={{ background: '#0A0A0A' }}>
                  <CalendarDays className="w-3.5 h-3.5" />
                  Connecter Google Calendar
                </a>
              )}
            </div>
          </div>
        </Card>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}
