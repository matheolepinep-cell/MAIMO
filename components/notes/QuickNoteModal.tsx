'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Search, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { markOnboardingStep } from '@/lib/onboarding'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'

type AccountOption = { id: string; name: string }

export function QuickNoteModal() {
  const { profile } = useUser()
  const { wsId } = useWorkspace()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null)
  const [search, setSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Listen for open trigger — skip on dashboard (it handles the event itself)
  useEffect(() => {
    const handler = () => {
      if (!pathname?.startsWith('/app/dashboard')) setOpen(true)
    }
    window.addEventListener('open:quick-note-modal', handler)
    return () => window.removeEventListener('open:quick-note-modal', handler)
  }, [pathname])

  // Notify SupportWidget to hide itself while this modal is open
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(open ? 'noteModalOpen' : 'noteModalClose'))
  }, [open])

  // Fetch accounts when modal opens
  useEffect(() => {
    if (!open || !profile) return
    const supabase = createClient()
    let q = supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name')
    if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    q.then(({ data }) => setAccounts((data ?? []) as AccountOption[]))
  }, [open, profile, wsId])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleClose = () => {
    setOpen(false)
    setSelectedAccount(null)
    setSearch('')
    setDropdownOpen(false)
    setContent('')
    setError('')
  }

  const filtered = search
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : accounts

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAccount) { setError('Veuillez sélectionner un client.'); return }
    if (!content.trim()) { setError('Veuillez saisir le contenu de la note.'); return }
    if (!profile) return

    setSaving(true)
    setError('')

    const supabase = createClient()
    const today = new Date().toLocaleDateString('fr-FR')

    const { data: note, error: insertErr } = await supabase
      .from('notes')
      .insert({
        account_id: selectedAccount.id,
        company_id: profile.company_id,
        user_id: profile.id,
        title: `Note du ${today} — ${selectedAccount.name}`,
        content: content.trim(),
        source: 'text',
        is_deleted: false,
        workspace_id: wsId ?? null,
      })
      .select()
      .single()

    if (insertErr || !note) {
      setError('Erreur lors de la création de la note.')
      setSaving(false)
      return
    }

    // Fire-and-forget RAG indexing
    fetch('/api/index-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note_id: note.id,
        content: note.content,
        account_id: selectedAccount.id,
        company_id: profile.company_id,
        workspace_id: wsId ?? null,
      }),
    }).catch(() => {})

    markOnboardingStep(2)
    setSaving(false)
    handleClose()
  }

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title="Nouvelle note"
      footer={
        <Button
          form="quick-note-form"
          type="submit"
          loading={saving}
          className="w-full"
          style={{ background: '#2563EB' }}
        >
          Enregistrer
        </Button>
      }
    >
      <form id="quick-note-form" onSubmit={handleSubmit} className="space-y-4">

        {/* Searchable account selector */}
        <div>
          <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
            Client concerné <span className="text-red-500">*</span>
          </label>
          <div ref={dropdownRef} className="relative">
            <div
              className="flex items-center gap-2 w-full px-3 rounded-xl border border-gray-200 bg-white cursor-text transition-all"
              style={{ minHeight: 44 }}
              onClick={() => { setDropdownOpen(true); searchInputRef.current?.focus() }}
            >
              {selectedAccount && !dropdownOpen ? (
                <span className="flex-1 text-sm text-[#1E293B] py-2.5">{selectedAccount.name}</span>
              ) : (
                <>
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true) }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder={selectedAccount ? selectedAccount.name : 'Rechercher un client…'}
                    className="flex-1 text-sm bg-transparent outline-none text-[#1E293B] placeholder:text-gray-400 py-2.5"
                  />
                </>
              )}
            </div>

            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-48 overflow-y-auto z-10">
                {filtered.length === 0 ? (
                  <p className="text-sm text-gray-400 px-3 py-3">Aucun résultat</p>
                ) : (
                  filtered.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => { setSelectedAccount(acc); setSearch(''); setDropdownOpen(false) }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
                      style={{ color: '#1E293B' }}
                    >
                      <span className="flex-1 truncate">{acc.name}</span>
                      {selectedAccount?.id === acc.id && <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Note content */}
        <div>
          <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Contenu de la note</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Points clés de l'échange, informations importantes…"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </BottomSheet>
  )
}
