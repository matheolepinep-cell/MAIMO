'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { MessageCircle, Send, Paperclip, ArrowLeft, FileText, ImageIcon, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { UserProfile, Document } from '@/types/database'

type ConvMember = { id: string; full_name: string; email: string }

type Conversation = {
  id: string
  company_id: string
  created_at: string
  other_user: ConvMember
  last_message?: { content: string | null; message_type: string; created_at: string; sender_id: string } | null
  unread_count: number
}

type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  document_id: string | null
  message_type: 'text' | 'document'
  read: boolean
  created_at: string
  document?: Document | null
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function timeShort(d: string) {
  const date = new Date(d)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444']
function userColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default function MessagesPage() {
  const { profile } = useUser()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [companyDocs, setCompanyDocs] = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Mobile: show conversation list or active conversation
  const [mobileView, setMobileView] = useState<'list' | 'conv'>('list')

  const fetchConversations = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()

    // Get all conversations where current user is a member
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', profile.id)

    if (!memberships?.length) {
      // No conversations yet — build list from team members
      const { data: members } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('company_id', profile.company_id)
        .neq('id', profile.id)
      setConversations((members ?? []).map((m: ConvMember) => ({
        id: '',
        company_id: profile.company_id,
        created_at: '',
        other_user: m,
        last_message: null,
        unread_count: 0,
      })))
      setLoading(false)
      return
    }

    const convIds = memberships.map((m: { conversation_id: string }) => m.conversation_id)

    const [{ data: convs }, { data: allMembers }] = await Promise.all([
      supabase.from('conversations').select('*').in('id', convIds),
      supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', convIds),
    ])

    const otherUserIds = (allMembers ?? [])
      .filter((m: { user_id: string }) => m.user_id !== profile.id)
      .map((m: { user_id: string }) => m.user_id)

    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', otherUserIds)

    const usersMap: Record<string, ConvMember> = {}
    for (const u of users ?? []) usersMap[u.id] = u

    const convMemberMap: Record<string, string> = {}
    for (const m of allMembers ?? []) {
      if (m.user_id !== profile.id) convMemberMap[m.conversation_id] = m.user_id
    }

    // Fetch last message and unread count per conversation
    const enriched: Conversation[] = []
    for (const conv of convs ?? []) {
      const otherId = convMemberMap[conv.id]
      const other = usersMap[otherId]
      if (!other) continue

      const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
        supabase.from('messages').select('content, message_type, created_at, sender_id').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id).eq('read', false).neq('sender_id', profile.id),
      ])

      enriched.push({
        ...conv,
        other_user: other,
        last_message: lastMsgs?.[0] ?? null,
        unread_count: unread ?? 0,
      })
    }

    // Also add team members who have no conversation yet
    const { data: allTeam } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('company_id', profile.company_id)
      .neq('id', profile.id)

    const coveredIds = new Set(enriched.map((c) => c.other_user.id))
    for (const m of allTeam ?? []) {
      if (!coveredIds.has(m.id)) {
        enriched.push({ id: '', company_id: profile.company_id, created_at: '', other_user: m, last_message: null, unread_count: 0 })
      }
    }

    enriched.sort((a, b) => {
      const ta = a.last_message?.created_at ?? a.created_at
      const tb = b.last_message?.created_at ?? b.created_at
      return tb.localeCompare(ta)
    })

    setConversations(enriched)
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConv(conv)
    setMobileView('conv')
    if (!conv.id || !profile) {
      setMessages([])
      return
    }
    setMsgLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*, document:document_id(*)')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    setMessages((data as Message[]) ?? [])
    setMsgLoading(false)
    // Mark as read
    await supabase.from('messages').update({ read: true }).eq('conversation_id', conv.id).neq('sender_id', profile.id).eq('read', false)
    fetchConversations()
  }, [profile, fetchConversations])

  // Realtime subscription
  useEffect(() => {
    if (!activeConv?.id || !profile) return
    const supabase = createClient()
    const channel = supabase
      .channel(`messages-${activeConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConv.id}` }, async (payload) => {
        const msg = payload.new as Message
        if (msg.document_id) {
          const { data: doc } = await supabase.from('documents').select('*').eq('id', msg.document_id).single()
          setMessages((prev) => [...prev, { ...msg, document: doc }])
        } else {
          setMessages((prev) => [...prev, msg])
        }
        if (msg.sender_id !== profile.id) {
          await supabase.from('messages').update({ read: true }).eq('id', msg.id)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeConv?.id, profile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getOrCreateConversation = async (): Promise<string | null> => {
    if (!profile || !activeConv) return null
    if (activeConv.id) return activeConv.id

    const supabase = createClient()
    const { data: conv } = await supabase
      .from('conversations')
      .insert({ company_id: profile.company_id })
      .select()
      .single()
    if (!conv) return null

    await supabase.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: profile.id },
      { conversation_id: conv.id, user_id: activeConv.other_user.id },
    ])

    setActiveConv((prev) => prev ? { ...prev, id: conv.id } : prev)
    setConversations((prev) => prev.map((c) => c.other_user.id === activeConv.other_user.id ? { ...c, id: conv.id } : c))
    return conv.id
  }

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
      message_type: 'text',
    })
    setText('')

    // Notification to recipient
    await fetch('/api/notifications/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: activeConv!.other_user.id,
        senderName: profile.full_name,
        content: text.trim(),
        conversationId: convId,
      }),
    })

    setSending(false)
  }

  const loadCompanyDocs = async () => {
    if (!profile) return
    setDocsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50)
    setCompanyDocs((data as Document[]) ?? [])
    setDocsLoading(false)
  }

  const handleShareDocument = async (doc: Document) => {
    if (!profile || !activeConv) return
    setAttachOpen(false)
    const convId = await getOrCreateConversation()
    if (!convId) return

    const supabase = createClient()
    await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: profile.id,
      content: null,
      document_id: doc.id,
      message_type: 'document',
    })

    // Notification
    await fetch('/api/notifications/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: activeConv.other_user.id,
        senderName: profile.full_name,
        content: `A partagé un document : ${doc.title ?? doc.file_name}`,
        conversationId: convId,
        type: 'document_shared',
        documentId: doc.id,
      }),
    })
  }

  if (!profile) return null

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Messages" />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
        {/* Conversation list */}
        <div
          className={`${mobileView === 'conv' ? 'hidden' : 'flex'} md:flex flex-col border-r border-gray-100`}
          style={{ width: '100%', maxWidth: '100%', background: '#fff' }}
        >
          <div className="hidden md:block" style={{ maxWidth: 320, width: '100%' }}>
            <div className="px-4 py-4 border-b border-gray-100">
              <p className="font-semibold text-[#0F172A]">Messages</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ maxWidth: 'min(100%, 320px)' }}>
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
                  style={{ background: activeConv?.other_user.id === conv.other_user.id ? '#F0F4FF' : 'transparent' }}
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
                      {conv.last_message && (
                        <p className="text-[10px] text-[#94A3B8] shrink-0">{timeShort(conv.last_message.created_at)}</p>
                      )}
                    </div>
                    {conv.last_message ? (
                      <p className="text-xs text-[#94A3B8] truncate">
                        {conv.last_message.message_type === 'document' ? '📎 Document' : conv.last_message.content ?? ''}
                      </p>
                    ) : (
                      <p className="text-xs text-[#CBD5E1]">Démarrer une conversation</p>
                    )}
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center" style={{ background: '#3B82F6' }}>
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation view */}
        <div
          className={`${mobileView === 'list' ? 'hidden' : 'flex'} md:flex flex-1 flex-col bg-[#F8FAFC]`}
        >
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <MessageCircle className="w-12 h-12 text-gray-200" />
              <p className="text-sm text-[#94A3B8]">Sélectionnez une conversation</p>
            </div>
          ) : (
            <>
              {/* Conv header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
                <button onClick={() => setMobileView('list')} className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
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

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
                {msgLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12">
                    <p className="text-sm text-[#94A3B8]">Commencez la conversation</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === profile.id
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        {msg.message_type === 'document' && msg.document ? (
                          <div
                            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl max-w-[240px]"
                            style={{ background: isMine ? '#3B82F6' : '#fff', border: isMine ? 'none' : '1px solid #E2E8F0' }}
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isMine ? 'rgba(255,255,255,0.2)' : '#F0F4FF' }}>
                              {msg.document.file_type === 'image'
                                ? <ImageIcon className="w-4 h-4" style={{ color: isMine ? 'white' : '#3B82F6' }} />
                                : <FileText className="w-4 h-4" style={{ color: isMine ? 'white' : '#3B82F6' }} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate" style={{ color: isMine ? 'white' : '#1E293B' }}>
                                {msg.document.title ?? msg.document.file_name}
                              </p>
                              <p className="text-[10px]" style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#94A3B8' }}>
                                {msg.document.file_type?.toUpperCase()}
                              </p>
                            </div>
                            <a href={`/api/documents/${msg.document.id}/open`} target="_blank" rel="noreferrer" className="shrink-0">
                              <ExternalLink className="w-3.5 h-3.5" style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#94A3B8' }} />
                            </a>
                          </div>
                        ) : (
                          <div
                            className="px-3 py-2 rounded-2xl max-w-[75%] text-sm leading-relaxed"
                            style={{
                              background: isMine ? '#3B82F6' : '#fff',
                              color: isMine ? 'white' : '#1E293B',
                              border: isMine ? 'none' : '1px solid #E2E8F0',
                            }}
                          >
                            {msg.content}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="px-4 py-3 bg-white border-t border-gray-100 flex items-end gap-2 shrink-0">
                <button
                  onClick={() => { setAttachOpen(true); loadCompanyDocs() }}
                  className="p-2 rounded-xl text-[#94A3B8] hover:text-[#3B82F6] hover:bg-[#EFF6FF] transition-all duration-150 shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Écrire un message..."
                  rows={1}
                  className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:border-blue-300 bg-[#F8FAFC]"
                  style={{ maxHeight: 120, lineHeight: 1.5 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="p-2.5 rounded-xl text-white transition-all duration-150 shrink-0 disabled:opacity-50"
                  style={{ background: '#3B82F6' }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Attach document sheet */}
      <BottomSheet open={attachOpen} onClose={() => setAttachOpen(false)} title="Partager un document">
        {docsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
          </div>
        ) : companyDocs.length === 0 ? (
          <p className="text-sm text-[#94A3B8] text-center py-6">Aucun document disponible</p>
        ) : (
          <div className="flex flex-col gap-2">
            {companyDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleShareDocument(doc)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all duration-150 text-left w-full"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EFF6FF' }}>
                  {doc.file_type === 'image'
                    ? <ImageIcon className="w-4 h-4 text-blue-500" />
                    : <FileText className="w-4 h-4 text-blue-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1E293B] truncate">{doc.title ?? doc.file_name}</p>
                  <p className="text-xs text-[#94A3B8]">{doc.file_type?.toUpperCase()}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
