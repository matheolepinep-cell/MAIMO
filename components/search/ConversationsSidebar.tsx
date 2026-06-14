'use client'

import { Plus, Trash2, MessageSquare } from 'lucide-react'

export type SidebarConvRow = {
  id: string
  title: string | null
  messages: { role: string; content: string }[]
  updated_at: string
  expires_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  if (hours < 48) return 'Hier'
  return `Il y a ${Math.floor(hours / 24)}j`
}

function expiryInfo(expiresAt: string): { label: string; urgent: boolean } | null {
  const hoursLeft = (new Date(expiresAt).getTime() - Date.now()) / 3600000
  if (hoursLeft <= 0 || hoursLeft > 6) return null
  if (hoursLeft < 2) return { label: `Expire dans ${Math.ceil(hoursLeft * 60)}min`, urgent: true }
  return { label: `Expire dans ${Math.ceil(hoursLeft)}h`, urgent: false }
}

export function ConversationsSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: {
  conversations: SidebarConvRow[]
  activeId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div style={{
      width: 260,
      flexShrink: 0,
      borderRight: '1px solid rgba(30,39,97,0.08)',
      background: '#FAFBFF',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
        <button
          onClick={onNew}
          style={{
            width: '100%', height: 40,
            background: '#1E2761', color: 'white',
            border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus style={{ width: 15, height: 15 }} />
          Nouvelle conversation
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {conversations.length === 0 ? (
          <p style={{
            fontSize: 12, color: '#94A3B8', textAlign: 'center',
            marginTop: 32, padding: '0 16px', lineHeight: 1.5,
          }}>
            Aucune conversation récente.<br />Commencez par poser une question.
          </p>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeId
            const exp = expiryInfo(conv.expires_at)
            const firstUser = conv.messages.find(m => m.role === 'user')
            const title = conv.title ?? firstUser?.content?.slice(0, 40) ?? 'Conversation'

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className="group"
                style={{
                  padding: '9px 10px',
                  borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                  background: isActive ? 'rgba(76,110,245,0.08)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(76,110,245,0.15)' : 'transparent'}`,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <MessageSquare style={{
                    width: 13, height: 13,
                    color: isActive ? '#4C6EF5' : '#94A3B8',
                    flexShrink: 0, marginTop: 2,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? '#1E2761' : '#374151',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      margin: 0,
                    }}>
                      {title}
                    </p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                      {timeAgo(conv.updated_at)}
                    </p>
                    {exp && (
                      <div style={{ marginTop: 3 }}>
                        {exp.urgent && (
                          <span style={{
                            display: 'inline-block',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            borderRadius: 4, padding: '0 5px', marginRight: 4,
                            fontSize: 9, color: '#EF4444', fontWeight: 600,
                          }}>
                            Expire bientôt
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: exp.urgent ? '#EF4444' : '#94A3B8' }}>
                          {exp.label}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                    className="opacity-0 group-hover:opacity-100"
                    style={{
                      padding: 4, borderRadius: 4,
                      border: 'none', background: 'none',
                      cursor: 'pointer', color: '#EF4444', flexShrink: 0,
                    }}
                    title="Supprimer"
                  >
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
