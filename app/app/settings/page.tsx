'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Building2, Key, User, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Company } from '@/types/database'

export default function SettingsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [company, setCompany] = useState<Company | null>(null)
  const [copied, setCopied] = useState(false)
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (profileLoading || !profile) return
    setFullName(profile.full_name)
    const supabase = createClient()
    supabase
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single()
      .then(({ data }) => setCompany(data))
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
    setSaving(true)
    setSaveMsg('')
    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({ full_name: fullName.trim() })
      .eq('id', profile.id)
    setSaveMsg(error ? error.message : 'Profil mis à jour !')
    setSaving(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div>
      <Header title="Paramètres" />
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Paramètres</h1>

        {/* Invite code */}
        {company?.invite_code && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#1E2761]/10 flex items-center justify-center">
                <Key className="w-4 h-4 text-[#1E2761]" />
              </div>
              <div>
                <p className="font-semibold text-[#1E293B] text-sm">Code d'invitation</p>
                <p className="text-xs text-[#64748B]">Partagez ce code pour inviter votre équipe</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
                <span className="text-2xl font-bold tracking-[0.3em] font-mono text-[#1E2761]">
                  {company.invite_code}
                </span>
              </div>
              <button
                onClick={copyCode}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-all duration-150 ${
                  copied
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-white border-gray-200 text-[#1E293B] hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </Card>
        )}

        {/* Company info */}
        {company && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <p className="font-semibold text-[#1E293B] text-sm">Espace de travail</p>
            </div>
            <p className="text-[#1E293B] font-medium">{company.name}</p>
            <p className="text-xs text-[#64748B] mt-0.5">
              Créé le {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(company.created_at))}
            </p>
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
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                profile?.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
              }`}>
                {profile?.role === 'admin' ? 'Admin' : 'Commercial'}
              </span>
            </div>
            {saveMsg && (
              <p className={`text-sm px-3 py-2 rounded-lg ${
                saveMsg.includes('!') ? 'text-green-700 bg-green-50' : 'text-red-500 bg-red-50'
              }`}>{saveMsg}</p>
            )}
            <Button type="submit" loading={saving} size="sm">Enregistrer</Button>
          </form>
        </Card>

        {/* Logout */}
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
