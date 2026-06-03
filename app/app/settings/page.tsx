'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Building2, Key, User, LogOut, RefreshCw, Palette } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Company } from '@/types/database'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function SettingsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor, setAccentColor } = useAccentColor()
  const [company, setCompany] = useState<Company | null>(null)
  const [copied, setCopied] = useState(false)

  // Profile
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Company
  const [companyName, setCompanyName] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyMsg, setCompanyMsg] = useState('')
  const [regenerating, setRegenerating] = useState(false)

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

  const copyCode = () => {
    if (!company?.invite_code) return
    navigator.clipboard.writeText(company.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

  const handleRegenerateCode = async () => {
    if (!company || profile?.role !== 'admin') return
    if (!confirm('Régénérer le code invalidera l\'ancien. Les collaborateurs devront utiliser le nouveau code. Continuer ?')) return
    setRegenerating(true)
    const newCode = generateInviteCode()
    const supabase = createClient()
    const { data, error } = await supabase
      .from('companies')
      .update({ invite_code: newCode })
      .eq('id', company.id)
      .select()
      .single()
    if (!error && data) setCompany(data)
    setRegenerating(false)
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

        {/* Invite code — admin only */}
        {isAdmin && company?.invite_code && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#1E2761]/10 flex items-center justify-center">
                <Key className="w-4 h-4 text-[#1E2761]" />
              </div>
              <div>
                <p className="font-semibold text-[#1E293B] text-sm">Code d'invitation</p>
                <p className="text-xs text-[#64748B]">Partagez ce code à vos collaborateurs</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
                <span className="text-2xl font-bold tracking-[0.3em] font-mono text-[#1E2761]">
                  {company.invite_code}
                </span>
              </div>
              <button
                onClick={copyCode}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-all duration-150 ${
                  copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-[#1E293B] hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <button
              onClick={handleRegenerateCode}
              disabled={regenerating}
              className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#1E293B] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              Régénérer le code
            </button>
          </Card>
        )}

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
