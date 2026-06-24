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
  light = false,
}: {
  conversations: SidebarConvRow[]
  activeId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  workspaceName?: string | null
  mobileMode?: boolean
  light?: boolean
}) {
  const groups = groupByDate(conversations)

  const bg = light ? '#FFFFFF' : '#0A0A0A'
  const textPrimary = light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'
  const textSecondary = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)'
  const hoverBg = light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'
  const activeBg = light ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.12)'
  const borderColor = light ? '#E5E5E5' : '#2A2A2A'

  return (
    <div style={{
      width: mobileMode ? '100%' : 260,
      flexShrink: 0,
      background: bg,
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
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 14,
          color: textPrimary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <PenLine style={{ width: 16, height: 16 }} />
        Nouvelle conversation
      </button>

      {/* Conversations list */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 16 }}>
        {groups.length === 0 ? (
          <p style={{
            fontSize: 12, color: textSecondary,
            textAlign: 'center', marginTop: 24, padding: '0 12px', lineHeight: 1.5,
          }}>
            Aucune conversation.<br />Commencez par poser une question.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p style={{
                fontSize: 11, color: textSecondary,
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
                      background: isActive ? activeBg : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = hoverBg }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <MessageCircle style={{ width: 13, height: 13, color: textSecondary, flexShrink: 0 }} />
                    <span style={{
                      flex: 1,
                      fontSize: 13,
                      color: textPrimary,
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
                        cursor: 'pointer', color: textSecondary,
                        flexShrink: 0, transition: 'color 0.12s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = textPrimary)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = textSecondary)}
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
          <div style={{ height: 1, background: borderColor, margin: '4px 0' }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 8px', flexShrink: 0,
          }}>
            <PanelLeft style={{ width: 14, height: 14, color: textSecondary, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {workspaceName}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
