'use client'

import { Plus, MessageCircle, Trash2 } from 'lucide-react'

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
      width: 240,
      flexShrink: 0,
      background: '#0A1628',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      padding: 12,
    }}>
      {/* New conversation button */}
      <button
        onClick={onNew}
        style={{
          width: '100%',
          background: '#1E3A6E',
          color: 'white',
          border: 'none',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2D4F8F')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#1E3A6E')}
      >
        <Plus style={{ width: 16, height: 16 }} />
        Nouvelle conversation
      </button>

      {conversations.length > 0 && (
        <p style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 8,
          marginLeft: 4,
        }}>
          Conversations
        </p>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {conversations.length === 0 ? (
          <p style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.3)',
            textAlign: 'center',
            marginTop: 24,
            padding: '0 12px',
            lineHeight: 1.5,
          }}>
            Aucune conversation.<br />Commencez par poser une question.
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
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 2,
                  cursor: 'pointer',
                  background: isActive ? '#1E3A6E' : 'transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <MessageCircle style={{
                    width: 14, height: 14,
                    color: 'rgba(255,255,255,0.5)',
                    flexShrink: 0, marginTop: 2,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13,
                      color: 'white',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: 0,
                    }}>
                      {title}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>
                      {timeAgo(conv.updated_at)}
                    </p>
                    {exp && (
                      <p style={{ fontSize: 10, margin: '2px 0 0', color: exp.urgent ? '#FCA5A5' : 'rgba(255,255,255,0.3)' }}>
                        {exp.label}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                    className="opacity-0 group-hover:opacity-100"
                    style={{
                      padding: 3, borderRadius: 4,
                      border: 'none', background: 'none',
                      cursor: 'pointer', color: 'rgba(255,255,255,0.3)',
                      flexShrink: 0, transition: 'color 0.12s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
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
