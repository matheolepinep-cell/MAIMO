'use client'

import { useEffect, useState } from 'react'
import { Building2, User, LogOut, Palette, Layers, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal'
import { ManageWorkspaceModal } from '@/components/workspace/ManageWorkspaceModal'
import type { Company, Workspace } from '@/types/database'

export default function SettingsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor, setAccentColor } = useAccentColor()
  const { userWorkspaces, isSuperAdmin, wsId } = useWorkspace()
  const [company, setCompany] = useState<Company | null>(null)
  const [showCreateWs, setShowCreateWs] = useState(false)
  const [managingWs, setManagingWs] = useState<Workspace | null>(null)

  // Profile
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Company
  const [companyName, setCompanyName] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyMsg, setCompanyMsg] = useState('')

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
    setSavingProfile(true)
    setProfileMsg('')
    const supabase = createClient()
    const { error } = await supabase.from('users').update({ full_name: fullName.trim() }).eq('id', profile.id)
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
    if (!error && data) { setCompany(data); setCompanyMsg('Nom mis à jour !') }
    else setCompanyMsg(error?.message ?? 'Erreur')
    setSavingCompany(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <div>
      <Header title="Paramètres" />
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Paramètres</h1>

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
                  className="w-full px-4 py-2.5 rounded-xl border text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(76,110,245,0.15)] focus:border-[#4C6EF5] transition-all duration-150"
                  style={{ borderColor: 'rgba(30,39,97,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws_company_services" className="text-sm font-medium text-[#0F172A]">Produits et services proposés</label>
                <textarea id="ws_company_services" rows={2} value={wsProfile.company_services}
                  onChange={(e) => setWsProfile(p => ({ ...p, company_services: e.target.value }))}
                  placeholder="Contrats de maintenance préventive, interventions curatives, formation opérateurs"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(76,110,245,0.15)] focus:border-[#4C6EF5] transition-all duration-150"
                  style={{ borderColor: 'rgba(30,39,97,0.12)', background: 'rgba(240,244,255,0.8)' }} />
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
                  className="w-full px-4 py-2.5 rounded-xl border text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(76,110,245,0.15)] focus:border-[#4C6EF5] transition-all duration-150"
                  style={{ borderColor: 'rgba(30,39,97,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws_company_differentiator" className="text-sm font-medium text-[#0F172A]">Argument différenciateur clé</label>
                <textarea id="ws_company_differentiator" rows={2} value={wsProfile.company_differentiator}
                  onChange={(e) => setWsProfile(p => ({ ...p, company_differentiator: e.target.value }))}
                  placeholder="Intervention garantie en moins de 4h, techniciens certifiés constructeur"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-[3px] focus:ring-[rgba(76,110,245,0.15)] focus:border-[#4C6EF5] transition-all duration-150"
                  style={{ borderColor: 'rgba(30,39,97,0.12)', background: 'rgba(240,244,255,0.8)' }} />
              </div>
              {wsMsg && (
                <p className={`text-sm px-3 py-2 rounded-lg ${wsMsg.includes('!') ? 'text-green-700 bg-green-50' : 'text-red-500 bg-red-50'}`}>{wsMsg}</p>
              )}
              <Button type="submit" loading={savingWs} size="sm">Sauvegarder</Button>
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
                onChange={(e) => setCompanyName(e.target.value)} required />
              <p className="text-xs text-[#94A3B8]">
                Créé le {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(company.created_at))}
              </p>
              {companyMsg && (
                <p className={`text-sm px-3 py-2 rounded-lg ${companyMsg.includes('!') ? 'text-green-700 bg-green-50' : 'text-red-500 bg-red-50'}`}>{companyMsg}</p>
              )}
              <Button type="submit" loading={savingCompany} size="sm">Enregistrer</Button>
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
              onChange={(e) => setFullName(e.target.value)} required />
            <Input id="email" label="Email" value={profile?.email ?? ''} disabled
              className="bg-gray-50 text-[#94A3B8]" />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              profile?.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
            }`}>
              {profile?.role === 'admin' ? 'Admin' : 'Collaborateur'}
            </span>
            {profileMsg && (
              <p className={`text-sm px-3 py-2 rounded-lg ${profileMsg.includes('!') ? 'text-green-700 bg-green-50' : 'text-red-500 bg-red-50'}`}>{profileMsg}</p>
            )}
            <Button type="submit" loading={savingProfile} size="sm">Enregistrer</Button>
          </form>
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
              {['#4C6EF5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#1E2761'].map((c) => (
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
              style={{ background: 'rgba(30,39,97,0.12)', color: '#1E2761', borderColor: 'rgba(30,39,97,0.2)' }}>Client</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ background: 'rgba(30,39,97,0.05)', color: 'rgba(30,39,97,0.5)', borderColor: 'rgba(30,39,97,0.1)' }}>Prospect</span>
            <span className="text-xs text-[#94A3B8] ml-1">Aperçu</span>
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
