'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { MessageCircle, Send, ArrowLeft, FileText, ImageIcon, ExternalLink, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Header } from '@/components/layout/Header'
import { useSearchParams, useRouter as useNextRouter } from 'next/navigation'
import type { UserProfile } from '@/types/database'

type TeamMember = Pick<UserProfile, 'id' | 'full_name' | 'email'>

type Conversation = {
  id: string
  participants: string[]
  last_message: string | null
  last_message_at: string
  created_at: string
  other_user: TeamMember
  unread_count: number
}

type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  file_path: string | null
  file_name: string | null
  file_type: string | null
  created_at: string
  read_by: string[]
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function timeShort(d: string) {
  const date = new Date(d)
  const now = new Date()
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444']
function userColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return COLORS[Math.abs(h) % COLORS.length]
}

function MessagesUrlHandler({
  conversations,
  loading,
  openConversation,
}: {
  conversations: Conversation[]
  loading: boolean
  openConversation: (conv: Conversation) => void
}) {
  const searchParams = useSearchParams()
  const router = useNextRouter()
  const handled = useRef(false)

  useEffect(() => {
    const userId = searchParams.get('userId')
    if (!userId || handled.current || loading) return
    const conv = conversations.find((c) => c.other_user.id === userId)
    if (!conv) return
    handled.current = true
    openConversation(conv)
    router.replace('/app/messages', { scroll: false } as Parameters<typeof router.replace>[1])
  }, [conversations, loading, searchParams, openConversation, router])

  return null
}

export default function MessagesPage() {
  const { profile } = useUser()
  const { wsId } = useWorkspace()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'conv'>('list')
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  /* ─── fetch conversations ─── */
  const fetchConversations = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()

    // Conversations where current user is a participant
    let convQ = supabase
      .from('conversations')
      .select('*')
      .contains('participants', [profile.id])
      .order('last_message_at', { ascending: false })
    if (wsId) convQ = convQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    const { data: convs } = await convQ

    // Team members
    const { data: team } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('company_id', profile.company_id)
      .neq('id', profile.id)

    const teamMap: Record<string, TeamMember> = {}
    for (const m of team ?? []) teamMap[m.id] = m

    const enriched: Conversation[] = []

    for (const conv of convs ?? []) {
      const otherId = conv.participants.find((p: string) => p !== profile.id)
      const other = otherId ? teamMap[otherId] : null
      if (!other) continue

      const { count: unread } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', profile.id)
        .not('read_by', 'cs', `{${profile.id}}`)

      enriched.push({ ...conv, other_user: other, unread_count: unread ?? 0 })
    }

    // Add team members with no conversation yet
    const usedIds = new Set(enriched.map((c) => c.other_user.id))
    for (const m of team ?? []) {
      if (!usedIds.has(m.id)) {
        enriched.push({
          id: '',
          participants: [profile.id, m.id],
          last_message: null,
          last_message_at: '',
          created_at: '',
          other_user: m,
          unread_count: 0,
        })
      }
    }

    setConversations(enriched)
    setLoading(false)
  }, [profile, wsId])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  /* ─── mark all messages as read on mount ─── */
  useEffect(() => {
    if (!profile?.id) return
    const supabase = createClient()
    const userId = profile.id
    ;(async () => {
      let convQ = supabase
        .from('conversations')
        .select('id')
        .contains('participants', [userId])
      if (wsId) convQ = convQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      const { data: convs } = await convQ
      for (const conv of convs ?? []) {
        const { data: unread } = await supabase
          .from('messages')
          .select('id, read_by')
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
          .not('read_by', 'cs', `{${userId}}`)
        for (const msg of unread ?? []) {
          await supabase
            .from('messages')
            .update({ read_by: [...(msg.read_by ?? []), userId] })
            .eq('id', msg.id)
        }
      }
    })()
  }, [profile?.id, wsId])

  /* ─── open conversation ─── */
  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConv(conv)
    setMobileView('conv')
    if (!conv.id || !profile) { setMessages([]); return }

    setMsgLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    setMessages((data as Message[]) ?? [])
    setMsgLoading(false)

    // Mark unread messages as read
    const unreadMsgs = ((data as Message[]) ?? [])
      .filter((m) => m.sender_id !== profile.id && !m.read_by.includes(profile.id))
    for (const msg of unreadMsgs) {
      await supabase
        .from('messages')
        .update({ read_by: [...msg.read_by, profile.id] })
        .eq('id', msg.id)
    }
    if (unreadMsgs.length > 0) fetchConversations()
  }, [profile, fetchConversations])

  /* ─── realtime ─── */
  useEffect(() => {
    if (!activeConv?.id || !profile) return
    const supabase = createClient()
    const channel = supabase
      .channel(`messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, (payload) => {
        const msg = payload.new as Message
        setMessages((prev) => [...prev, msg])
        if (msg.sender_id !== profile.id) {
          supabase.from('messages').select('read_by').eq('id', msg.id).single().then(({ data: row }) => {
            if (row && !row.read_by.includes(profile.id)) {
              supabase.from('messages').update({ read_by: [...row.read_by, profile.id] }).eq('id', msg.id)
            }
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeConv?.id, profile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ─── get or create conversation ─── */
  const getOrCreateConversation = async (): Promise<string | null> => {
    if (!profile || !activeConv) return null
    if (activeConv.id) return activeConv.id

    const supabase = createClient()
    const participants = [profile.id, activeConv.other_user.id]

    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .contains('participants', participants)
      .limit(1)

    if (existing?.[0]) {
      const id = existing[0].id
      setActiveConv((prev) => prev ? { ...prev, id } : prev)
      setConversations((prev) => prev.map((c) => c.other_user.id === activeConv.other_user.id ? { ...c, id } : c))
      return id
    }

    const { data: conv } = await supabase
      .from('conversations')
      .insert({ participants, workspace_id: wsId ?? null })
      .select()
      .single()

    if (!conv) return null
    setActiveConv((prev) => prev ? { ...prev, id: conv.id } : prev)
    setConversations((prev) => prev.map((c) => c.other_user.id === activeConv.other_user.id ? { ...c, id: conv.id } : c))
    return conv.id
  }

  /* ─── send message ─── */
  const handleSend = async () => {
    if (!text.trim() || !profile) return
    setSending(true)
    const convId = await getOrCreateConversation()
    if (!convId) { setSending(false); return }

    const supabase = createClient()
    await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: profile.id,
      content: text.trim(),
      read_by: [profile.id],
    })

    // Update conversation last_message
    await supabase.from('conversations').update({
      last_message: text.trim(),
      last_message_at: new Date().toISOString(),
    }).eq('id', convId)

    // Notify recipient
    if (activeConv?.other_user.id) {
      fetch('/api/notifications/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: activeConv.other_user.id, conversationId: convId }),
      }).catch(() => {})
    }

    setText('')
    fetchConversations()
    setSending(false)
  }

  /* ─── delete message ─── */
  const handleDeleteMessage = async (msg: Message) => {
    if (!profile) return
    const othersRead = msg.read_by.some((id) => id !== profile.id)
    const prev = messages

    // Optimistic update
    if (othersRead) {
      setMessages((m) => m.map((x) => x.id === msg.id ? { ...x, content: '__DELETED__', file_path: null, file_name: null } : x))
    } else {
      setMessages((m) => m.filter((x) => x.id !== msg.id))
    }
    setDeleteTarget(null)

    const supabase = createClient()
    const { error } = await supabase.from('messages').delete().eq('id', msg.id).eq('sender_id', profile.id)
    if (error) setMessages(prev)
  }

  if (!profile) return null

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 4rem)' }}>
      <Suspense fallback={null}>
        <MessagesUrlHandler conversations={conversations} loading={loading} openConversation={openConversation} />
      </Suspense>
      <Header title="Messages" />

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div
          className={`${mobileView === 'conv' ? 'hidden lg:flex' : 'flex'} flex-col bg-white border-r border-gray-100`}
          style={{ width: '100%', maxWidth: 'min(100%, 320px)' }}
        >
          <div className="px-4 py-4 border-b border-gray-100 hidden lg:block">
            <p className="font-semibold text-[#0F172A] text-sm">Messages</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
                <MessageCircle className="w-10 h-10 text-gray-200" />
                <p className="text-sm text-[#94A3B8] text-center">Aucun membre dans l'équipe</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.other_user.id}
                  onClick={() => openConversation(conv)}
                  className="flex items-center gap-3 w-full px-4 py-3 border-b border-gray-50 transition-all duration-150 text-left"
                  style={{ background: activeConv?.other_user.id === conv.other_user.id ? '#F5F5F5' : 'transparent' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                    style={{ background: userColor(conv.other_user.id) }}
                  >
                    {initials(conv.other_user.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-medium text-[#1E293B] truncate">{conv.other_user.full_name}</p>
                      {conv.last_message_at && (
                        <p className="text-[10px] text-[#94A3B8] shrink-0">{timeShort(conv.last_message_at)}</p>
                      )}
                    </div>
                    <p className="text-xs text-[#94A3B8] truncate">
                      {conv.last_message ?? 'Démarrer une conversation'}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center" style={{ background: '#2563EB' }}>
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation view */}
        <div className={`${mobileView === 'list' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col bg-[#F8FAFC]`}>
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <MessageCircle className="w-12 h-12 text-gray-200" />
              <p className="text-sm text-[#94A3B8]">Sélectionnez une conversation</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
                <button onClick={() => setMobileView('list')} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: userColor(activeConv.other_user.id) }}
                >
                  {initials(activeConv.other_user.full_name)}
                </div>
                <p className="font-medium text-[#0F172A] text-sm">{activeConv.other_user.full_name}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
                {msgLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-[#94A3B8]">Commencez la conversation</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === profile.id
                    const hasFile = !!msg.file_path
                    const isDeleted = msg.content === '__DELETED__'

                    const trashBtn = isMine && !isDeleted ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(msg) }}
                        className="absolute -top-2.5 -right-2.5 w-8 h-8 flex items-center justify-center rounded-md transition-all
                                   opacity-50 md:opacity-0 md:group-hover/msg:opacity-100 hover:!opacity-100"
                        style={{ background: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
                        title="Supprimer"
                        onMouseEnter={(e) => { (e.currentTarget.querySelector('svg') as SVGElement | null)?.setAttribute('style','color:#DC2626') }}
                        onMouseLeave={(e) => { (e.currentTarget.querySelector('svg') as SVGElement | null)?.setAttribute('style','color:#6B7280') }}
                      >
                        <Trash2 style={{ width: 14, height: 14, color: '#6B7280' }} />
                      </button>
                    ) : null

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        {isDeleted ? (
                          <div
                            className="px-3 py-2 rounded-2xl text-sm"
                            style={{ color: '#9CA3AF', fontStyle: 'italic', border: '1px solid #E2E8F0', background: '#fff' }}
                          >
                            Message supprimé
                          </div>
                        ) : hasFile ? (
                          <div className="relative group/msg">
                            <div
                              className="flex items-center gap-2 px-3 py-2.5 rounded-2xl max-w-[240px]"
                              style={{
                                background: isMine ? '#2563EB' : '#F3F4F6',
                                border: 'none',
                              }}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: isMine ? 'rgba(255,255,255,0.2)' : '#F5F5F5' }}
                              >
                                {msg.file_type === 'image'
                                  ? <ImageIcon className="w-4 h-4" style={{ color: isMine ? 'white' : '#3B82F6' }} />
                                  : <FileText className="w-4 h-4" style={{ color: isMine ? 'white' : '#3B82F6' }} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <a
                                  href={`/api/documents/by-path?path=${encodeURIComponent(msg.file_path ?? '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-medium truncate block hover:underline"
                                  style={{ color: isMine ? 'white' : '#1E293B' }}
                                >
                                  {msg.file_name}
                                </a>
                                <p className="text-[10px]" style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#94A3B8' }}>
                                  {msg.file_type?.toUpperCase()}
                                </p>
                              </div>
                              <a
                                href={`/api/documents/by-path?path=${encodeURIComponent(msg.file_path ?? '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0"
                              >
                                <ExternalLink className="w-3.5 h-3.5" style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#94A3B8' }} />
                              </a>
                            </div>
                            {trashBtn}
                          </div>
                        ) : (
                          <div className="relative group/msg">
                            <div
                              className="px-3 py-2 rounded-2xl max-w-[80%] text-[15px] leading-relaxed"
                              style={{
                                background: isMine ? '#2563EB' : '#F3F4F6',
                                color: isMine ? 'white' : '#0A0A0A',
                                border: 'none',
                              }}
                            >
                              {msg.content}
                            </div>
                            {trashBtn}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="px-4 py-3 bg-white border-t border-gray-100 flex items-end gap-2 shrink-0">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Écrire un message..."
                  rows={1}
                  className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 focus:outline-none focus:border-blue-300 bg-[#F8FAFC]"
                  style={{ maxHeight: 120, fontSize: 16 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-white transition-all duration-150 shrink-0 disabled:opacity-50"
                  style={{ background: '#2563EB' }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-t-[20px] sm:rounded-2xl sm:mx-4 sm:max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideUp 0.25s ease-out' }}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="px-6 pt-4 pb-8 sm:py-6">
              <h3 className="font-semibold text-[#0F172A] text-[17px] mb-2">Supprimer ce message ?</h3>
              <p className="text-sm text-[#94A3B8] mb-6">Cette action est irréversible.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-[#1E293B] hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDeleteMessage(deleteTarget)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-white transition-colors"
                  style={{ background: '#EF4444' }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
