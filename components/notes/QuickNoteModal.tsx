'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Search, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { markOnboardingStep } from '@/lib/onboarding'

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
  const [sheetStyle, setSheetStyle] = useState<React.CSSProperties>({})
  const [mounted, setMounted] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const savedScrollY = useRef(0)

  useEffect(() => { setMounted(true) }, [])

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

  // Body scroll lock + visualViewport tracking
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      return
    }

    savedScrollY.current = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY.current}px`
    document.body.style.width = '100%'

    const updateSheet = () => {
      const vv = window.visualViewport
      if (!vv) return
      setSheetStyle({
        height: vv.height * 0.85,
        transform: `translateY(${vv.offsetTop}px)`,
      })
    }

    updateSheet()
    window.visualViewport?.addEventListener('resize', updateSheet)
    window.visualViewport?.addEventListener('scroll', updateSheet)

    return () => {
      window.visualViewport?.removeEventListener('resize', updateSheet)
      window.visualViewport?.removeEventListener('scroll', updateSheet)
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, savedScrollY.current)
    }
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

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

  // Fetch accounts when modal opens
  useEffect(() => {
    if (!open || !profile) return
    const supabase = createClient()
    let q = supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name')
    if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    q.then(({ data }) => setAccounts((data ?? []) as AccountOption[]))
  }, [open, profile, wsId])

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

  const handleSubmit = async () => {
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

  if (!mounted || !open) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
    }}>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Sheet — not position:fixed */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: '#ffffff',
        borderRadius: '20px 20px 0 0',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '85%',
        ...sheetStyle,
        transition: 'height 0.2s ease-out, transform 0.2s ease-out',
      }}>
        {/* Handle */}
        <div style={{
          width: 36, height: 4, background: '#E5E7EB',
          borderRadius: 2, margin: '12px auto 0', flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #F3F4F6',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A' }}>
            Nouvelle note
          </span>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none',
            color: '#9CA3AF', fontSize: 20,
            cursor: 'pointer', padding: 4,
          }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
        }}>
          {/* Account selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#1E293B', marginBottom: 6 }}>
              Client concerné <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '0 12px',
                  minHeight: 44, borderRadius: 12,
                  border: '1px solid #E5E7EB', background: '#ffffff',
                  cursor: 'text', boxSizing: 'border-box',
                }}
                onClick={() => { setDropdownOpen(true); searchInputRef.current?.focus() }}
              >
                {selectedAccount && !dropdownOpen ? (
                  <span style={{ flex: 1, fontSize: 14, color: '#1E293B', padding: '10px 0' }}>
                    {selectedAccount.name}
                  </span>
                ) : (
                  <>
                    <Search style={{ width: 16, height: 16, color: '#9CA3AF', flexShrink: 0 }} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true) }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder={selectedAccount ? selectedAccount.name : 'Rechercher un client…'}
                      style={{
                        flex: 1, fontSize: 14, background: 'transparent',
                        outline: 'none', border: 'none', color: '#1E293B',
                        padding: '10px 0',
                      }}
                    />
                  </>
                )}
              </div>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  marginTop: 4, background: '#ffffff', borderRadius: 12,
                  border: '1px solid #E5E7EB', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  maxHeight: 180, overflowY: 'auto', zIndex: 10,
                }}>
                  {filtered.length === 0 ? (
                    <p style={{ fontSize: 14, color: '#9CA3AF', padding: '12px' }}>Aucun résultat</p>
                  ) : (
                    filtered.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => { setSelectedAccount(acc); setSearch(''); setDropdownOpen(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '10px 12px',
                          fontSize: 14, textAlign: 'left', color: '#1E293B',
                          background: 'none', border: 'none', cursor: 'pointer',
                        }}
                      >
                        <span style={{ flex: 1 }}>{acc.name}</span>
                        {selectedAccount?.id === acc.id && (
                          <Check style={{ width: 14, height: 14, color: '#2563EB', flexShrink: 0 }} />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Note content */}
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#1E293B', marginBottom: 6 }}>
              Contenu de la note
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Points clés de l'échange, informations importantes…"
              style={{
                width: '100%', padding: '10px 12px',
                borderRadius: 12, border: '1px solid #E5E7EB',
                fontSize: 14, color: '#1E293B', lineHeight: 1.5,
                resize: 'none', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#2563EB' }}
              onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E5E7EB' }}
            />
          </div>

          {error && <p style={{ fontSize: 14, color: '#EF4444', marginTop: 8 }}>{error}</p>}
        </div>

        {/* Footer — always visible */}
        <div style={{
          padding: '12px 20px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          borderTop: '1px solid #F3F4F6',
          background: '#ffffff',
          flexShrink: 0,
        }}>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              width: '100%', padding: '14px',
              background: content.trim() && selectedAccount ? '#2563EB' : '#E5E7EB',
              color: content.trim() && selectedAccount ? '#ffffff' : '#9CA3AF',
              border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
