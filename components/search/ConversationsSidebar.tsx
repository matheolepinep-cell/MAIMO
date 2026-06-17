'use client'

import { PenLine, Trash2, PanelLeft, MessageCircle } from 'lucide-react'

export type SidebarConvRow = {
  id: string
  title: string | null
  messages: { role: string; content: string }[]
  updated_at: string
  expires_at: string
}

function groupByDate(convs: SidebarConvRow[]): { label: string; items: SidebarConvRow[] }[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)

  const groups = [
    { label: "Aujourd'hui", items: [] as SidebarConvRow[] },
    { label: 'Hier', items: [] as SidebarConvRow[] },
    { label: '7 derniers jours', items: [] as SidebarConvRow[] },
    { label: 'Plus ancien', items: [] as SidebarConvRow[] },
  ]

  for (const conv of convs) {
    const d = new Date(conv.updated_at)
    const startOfD = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (startOfD >= startOfToday) groups[0].items.push(conv)
    else if (startOfD >= startOfYesterday) groups[1].items.push(conv)
    else if (startOfD >= startOfWeek) groups[2].items.push(conv)
    else groups[3].items.push(conv)
  }

  return groups.filter(g => g.items.length > 0)
}

export function ConversationsSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
  workspaceName,
  mobileMode = false,
}: {
  conversations: SidebarConvRow[]
  activeId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  workspaceName?: string | null
  mobileMode?: boolean
}) {
  const groups = groupByDate(conversations)

  return (
    <div style={{
      width: mobileMode ? '100%' : 260,
      flexShrink: 0,
      background: '#0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      padding: 8,
    }}>
      {/* New conversation button */}
      <button
        onClick={onNew}
        style={{
          width: '100%',
          background: 'transparent',
          border: '1px solid #2A2A2A',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 14,
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <PenLine style={{ width: 16, height: 16 }} />
        Nouvelle conversation
      </button>

      {/* Conversations list */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 16 }}>
        {groups.length === 0 ? (
          <p style={{
            fontSize: 12, color: 'rgba(255,255,255,0.3)',
            textAlign: 'center', marginTop: 24, padding: '0 12px', lineHeight: 1.5,
          }}>
            Aucune conversation.<br />Commencez par poser une question.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p style={{
                fontSize: 11, color: 'rgba(255,255,255,0.4)',
                padding: '4px 8px', marginBottom: 4,
                letterSpacing: '0.02em',
              }}>
                {group.label}
              </p>
              {group.items.map((conv) => {
                const isActive = conv.id === activeId
                const firstUser = conv.messages.find(m => m.role === 'user')
                const title = conv.title ?? firstUser?.content?.slice(0, 40) ?? 'Conversation'

                return (
                  <div
                    key={conv.id}
                    onClick={() => onSelect(conv.id)}
                    className="group"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      marginBottom: 2,
                      cursor: 'pointer',
                      background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <MessageCircle style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    <span style={{
                      flex: 1,
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.85)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {title}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                      className={mobileMode ? '' : 'opacity-0 group-hover:opacity-100'}
                      style={{
                        padding: 3, borderRadius: 4,
                        border: 'none', background: 'none',
                        cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                        flexShrink: 0, transition: 'color 0.12s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                      title="Supprimer"
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer — active workspace */}
      {workspaceName && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 8px', flexShrink: 0,
          }}>
            <PanelLeft style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {workspaceName}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
