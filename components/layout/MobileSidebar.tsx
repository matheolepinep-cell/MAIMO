'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Users, Settings, X } from 'lucide-react'
import {
  IconLayoutDashboard,
  IconPencil,
  IconDownload,
  IconBriefcase,
  IconMessage,
} from '@tabler/icons-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'
import { useUser } from '@/contexts/UserContext'
import { useRole } from '@/hooks/useRole'
import { createClient } from '@/lib/supabase/client'

type ConvRow = { id: string; title: string | null; updated_at: string }

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export function MobileSidebar() {
  const { open, close } = useMobileSidebar()
  const { profile } = useUser()
  const router = useRouter()
  const wsRole = useRole()
  const isContributeur = wsRole === 'contributeur'

  const [conversations, setConversations] = useState<ConvRow[]>([])

  useEffect(() => {
    if (!open || !profile) return
    const supabase = createClient()
    supabase
      .from('search_conversations')
      .select('id, title, updated_at')
      .eq('user_id', profile.id)
      .gt('expires_at', new Date().toISOString())
      .order('updated_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setConversations((data ?? []) as ConvRow[]))
  }, [open, profile])

  const quickActions = [
    { label: 'Dashboard', icon: <IconLayoutDashboard size={16} />, href: '/app/dashboard' },
    { label: 'Nouvelle note', icon: <IconPencil size={16} />, href: '/app/notes/new' },
    { label: 'Importer', icon: <IconDownload size={16} />, href: '/app/import' },
    { label: 'Portefeuille', icon: <IconBriefcase size={16} />, href: '/app/accounts' },
    { label: 'Messagerie', icon: <IconMessage size={16} />, href: '/app/messages' },
  ]

  const footerLinks = [
    ...(wsRole !== 'contributeur' ? [{ label: 'Équipe', icon: Users, href: '/app/team' }] : []),
    ...(profile?.role === 'admin' ? [{ label: 'Paramètres', icon: Settings, href: '/app/settings' }] : []),
  ]

  const navigate = (href: string) => { close(); router.push(href) }

  return (
    <>
      {/* Overlay */}
      <div
        className="lg:hidden fixed inset-0 z-[998] transition-all duration-200"
        style={{
          background: open ? 'rgba(0,0,0,0.4)' : 'transparent',
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={close}
      />

      {/* Drawer */}
      <aside
        className="lg:hidden fixed top-0 left-0 bottom-0 z-[999] flex flex-col"
        style={{
          width: 280,
          background: '#ffffff',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease-out',
          boxShadow: open ? '4px 0 24px rgba(0,0,0,0.12)' : 'none',
          borderRight: '1px solid #F3F4F6',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 12px',
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          borderBottom: '1px solid #F3F4F6', flexShrink: 0,
        }}>
          <Link href="/app/search" onClick={close}>
            <Image src="/logo.png" alt="Maimoo" width={100} height={28} />
          </Link>
          <button
            onClick={close}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Quick actions */}
        <div style={{ padding: '10px 8px 6px', flexShrink: 0 }}>
          {quickActions.map(({ label, icon, href }) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'none', textAlign: 'left',
                fontSize: 14, fontWeight: 500, color: '#374151',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ color: '#6B7280', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: '#F3F4F6', margin: '0 16px', flexShrink: 0 }} />

        {/* Recent conversations */}
        {!isContributeur && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ padding: '10px 20px 4px', flexShrink: 0 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#9CA3AF',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Récent
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {conversations.length === 0 ? (
                <p style={{ padding: '12px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                  Aucune conversation
                </p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => navigate('/app/search')}
                    style={{
                      display: 'block', width: '100%',
                      padding: '9px 12px', borderRadius: 8,
                      border: 'none', cursor: 'pointer', background: 'none',
                      textAlign: 'left',
                      fontSize: 13, color: '#374151',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                  >
                    {conv.title ?? 'Conversation sans titre'}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {isContributeur && <div style={{ flex: 1 }} />}

        <div style={{ height: 1, background: '#F3F4F6', margin: '0 16px', flexShrink: 0 }} />

        {/* Footer links + user profile */}
        <div style={{
          padding: '6px 8px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          flexShrink: 0,
        }}>
          {footerLinks.map(({ label, icon: Icon, href }) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'none', textAlign: 'left',
                fontSize: 14, fontWeight: 500, color: '#374151',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <Icon style={{ width: 16, height: 16, color: '#6B7280', flexShrink: 0 }} />
              {label}
            </button>
          ))}

          {/* User profile */}
          {profile && (
            <button
              onClick={() => navigate('/app/profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px', marginTop: 4,
                borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'none', textAlign: 'left',
                borderTop: '1px solid #F3F4F6', transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#2563EB', color: '#ffffff', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>
                {getInitials(profile.full_name ?? '?')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: '#0A0A0A',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {profile.full_name}
                </div>
                <div style={{
                  fontSize: 11, color: '#9CA3AF',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {profile.email ?? ''}
                </div>
              </div>
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
