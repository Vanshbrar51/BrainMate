'use client'

// hooks/useGmailIntegration.ts
// Self-contained client hook for Gmail integration.
// Manages connection status, email listing, panel state, import actions,
// and advanced Gmail features (Smart Compose, Thread Intelligence, Scheduled Sends, etc.).

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { ScheduledSend, ContactIntel } from '@/types/writeright'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailConnectionStatus {
  connected: boolean
  connection: {
    gmail_email: string
    connected_at: string
    last_synced_at: string | null
  } | null
  error?: string
}

export interface GmailEmailItem {
  id: string
  thread_id: string
  subject: string
  sender_email: string
  sender_name: string
  snippet: string
  body_plain: string
  body_preview: string
  timestamp: string
  is_unread: boolean
  labels: string[]
  word_count: number
}

export interface GmailPanelState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
  emails: GmailEmailItem[]
  selectedEmail: GmailEmailItem | null
  previewOpen: boolean
  nextPageToken: string | null
  totalEstimate: number
  filter: 'INBOX' | 'SENT' | 'DRAFT'
  unreadOnly: boolean
}

type GmailAction = 'improve' | 'summarize' | 'rewrite' | 'change_tone' | 'shorten' | 'professionalize' | 'reply'

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function gmailGet<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    return Promise.reject(new Error(body.message ?? `Gmail API error ${res.status}`))
  }
  return res.json() as Promise<T>
}

async function gmailPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string }
    return Promise.reject(new Error(data.message ?? `Gmail API error ${res.status}`))
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGmailIntegration() {
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<GmailConnectionStatus>({
    connected: false,
    connection: null,
  })
  const [connectionLoading, setConnectionLoading] = useState(false)
  const statusChecked = useRef(false)

  // Panel state
  const [panel, setPanel] = useState<GmailPanelState>({
    isOpen: false,
    isLoading: false,
    error: null,
    emails: [],
    selectedEmail: null,
    previewOpen: false,
    nextPageToken: null,
    totalEstimate: 0,
    filter: 'INBOX',
    unreadOnly: false,
  })

  // Advanced States
  const [searchQuery, setSearchQuery] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [scheduledSends, setScheduledSends] = useState<ScheduledSend[]>([])
  const [contactIntel, setContactIntel] = useState<ContactIntel | null>(null)
  const [contactIntelLoading, setContactIntelLoading] = useState(false)
  
  // Thread View State
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<GmailEmailItem[]>([])
  const [threadBrief, setThreadBrief] = useState<string>('')
  const [threadLoading, setThreadLoading] = useState(false)

  // Smart Compose State
  const [smartComposeText, setSmartComposeText] = useState('')
  const [smartComposeLoading, setSmartComposeLoading] = useState(false)

  // ── Check connection status on mount ──
  useEffect(() => {
    if (statusChecked.current) return
    statusChecked.current = true

    void (async () => {
      setConnectionLoading(true)
      try {
        const status = await gmailGet<GmailConnectionStatus>('/api/gmail/status')
        setConnectionStatus(status)
      } catch {
        // Not connected — default state is fine
      } finally {
        setConnectionLoading(false)
      }
    })()
  }, [])

  // ── Polling for unread counts ──
  useEffect(() => {
    if (!connectionStatus.connected) return

    const pollUnreadCount = async () => {
      try {
        const result = await fetch('/api/gmail/emails?maxResults=1&unreadOnly=true')
        if (result.ok) {
          const data = await result.json()
          setUnreadCount(data.total_estimate || 0)
        }
      } catch {
        // Fail silently
      }
    }

    pollUnreadCount()
    const timer = setInterval(pollUnreadCount, 60000)
    return () => clearInterval(timer)
  }, [connectionStatus.connected])

  // ── Connect Gmail ──
  const connect = useCallback(async () => {
    setConnectionLoading(true)
    try {
      const returnTo = window.location.pathname
      const { url } = await gmailGet<{ url: string }>(`/api/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`)
      window.location.href = url
    } catch (err) {
      setConnectionLoading(false)
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setConnectionStatus(prev => ({ ...prev, error: msg }))
    }
  }, [])

  // ── Reconnect Gmail ──
  const reconnect = useCallback(async () => {
    await connect()
  }, [connect])

  // ── Disconnect Gmail ──
  const disconnect = useCallback(async () => {
    setConnectionLoading(true)
    try {
      await gmailPost('/api/gmail/disconnect')
      setConnectionStatus({ connected: false, connection: null })
      setPanel(p => ({ ...p, isOpen: false, emails: [], selectedEmail: null, previewOpen: false }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Disconnect failed'
      setConnectionStatus(prev => ({ ...prev, error: msg }))
    } finally {
      setConnectionLoading(false)
    }
  }, [])

  // ── Handle OAuth redirect result ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail_connected') === 'true') {
      void (async () => {
        try {
          const status = await gmailGet<GmailConnectionStatus>('/api/gmail/status')
          setConnectionStatus(status)
        } catch { /* noop */ }
      })()
      const url = new URL(window.location.href)
      url.searchParams.delete('gmail_connected')
      window.history.replaceState({}, '', url.toString())
    }
    if (params.get('gmail_error')) {
      const errType = params.get('gmail_error')
      const friendlyMsg = errType === 'gateway_offline'
        ? 'Authentication gateway is offline. Please make sure it is running.'
        : `Gmail connection failed: ${errType}`
      setPanel(p => ({ ...p, error: friendlyMsg }))
      const url = new URL(window.location.href)
      url.searchParams.delete('gmail_error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // ── Fetch Emails ──
  const fetchEmails = useCallback(async (opts?: { append?: boolean; pageToken?: string }) => {
    setPanel(p => ({ ...p, isLoading: true, error: null }))
    try {
      const params = new URLSearchParams({
        maxResults: '20',
        unreadOnly: panel.unreadOnly.toString(),
        label: panel.filter,
      })
      if (opts?.pageToken) params.set('pageToken', opts.pageToken)

      const result = await gmailGet<{
        emails: GmailEmailItem[]
        next_page_token: string | null
        total_estimate: number
      }>(`/api/gmail/emails?${params}`)

      setPanel(p => ({
        ...p,
        isLoading: false,
        emails: opts?.append ? [...p.emails, ...result.emails] : result.emails,
        nextPageToken: result.next_page_token,
        totalEstimate: result.total_estimate,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch emails'
      if (msg.includes('401') || msg.includes('expired')) {
        setConnectionStatus(s => ({ ...s, connected: false }))
      }
      setPanel(p => ({ ...p, isLoading: false, error: msg }))
    }
  }, [panel.filter, panel.unreadOnly])

  // ── Toggle Panel Open ──
  const togglePanel = useCallback(() => {
    setPanel(p => {
      const willOpen = !p.isOpen
      if (willOpen && p.emails.length === 0 && connectionStatus.connected) {
        setTimeout(() => { void fetchEmails() }, 0)
      }
      return { ...p, isOpen: willOpen, previewOpen: false, selectedEmail: null }
    })
  }, [connectionStatus.connected, fetchEmails])

  // ── Select Email for Preview ──
  const selectEmail = useCallback(async (emailId: string) => {
    const cached = panel.emails.find(e => e.id === emailId)
    if (cached) {
      setPanel(p => ({ ...p, selectedEmail: cached, previewOpen: true }))
    }

    try {
      const { email } = await gmailGet<{ email: GmailEmailItem }>(`/api/gmail/emails/${emailId}`)
      setPanel(p => ({ ...p, selectedEmail: email, previewOpen: true }))
    } catch {
      // Use cached if fetch fails
    }
  }, [panel.emails])

  // ── Close Preview ──
  const closePreview = useCallback(() => {
    setPanel(p => ({ ...p, selectedEmail: null, previewOpen: false }))
  }, [])

  // ── Set Filter ──
  const setFilter = useCallback((filter: 'INBOX' | 'SENT' | 'DRAFT') => {
    setPanel(p => ({ ...p, filter, emails: [], nextPageToken: null }))
    setTimeout(() => { void fetchEmails() }, 0)
  }, [fetchEmails])

  // ── Toggle Unread Only ──
  const toggleUnreadOnly = useCallback(() => {
    setPanel(p => ({ ...p, unreadOnly: !p.unreadOnly, emails: [], nextPageToken: null }))
    setTimeout(() => { void fetchEmails() }, 0)
  }, [fetchEmails])

  // ── Load More ──
  const loadMore = useCallback(() => {
    if (panel.nextPageToken) {
      void fetchEmails({ append: true, pageToken: panel.nextPageToken })
    }
  }, [panel.nextPageToken, fetchEmails])

  // ── Build import text ──
  const buildImportText = useCallback((email: GmailEmailItem, action: GmailAction): string => {
    const prefixes: Record<GmailAction, string> = {
      improve: 'Improve this email:\n\n',
      summarize: 'Summarize this email:\n\n',
      rewrite: 'Rewrite this email:\n\n',
      change_tone: 'Change the tone of this email:\n\n',
      shorten: 'Shorten this email:\n\n',
      professionalize: 'Make this email more professional:\n\n',
      reply: 'Draft a professional reply to this email:\n\n',
    }

    const emailContent = [
      `Subject: ${email.subject}`,
      `From: ${email.sender_name} <${email.sender_email}>`,
      '',
      email.body_plain || email.snippet,
    ].join('\n')

    return `${prefixes[action]}${emailContent}`
  }, [])

  // ── Client-side filtering ──
  const filteredEmails = useMemo(() => {
    if (!searchQuery.trim()) return panel.emails
    const query = searchQuery.toLowerCase()
    return panel.emails.filter(e =>
      e.subject.toLowerCase().includes(query) ||
      e.sender_name.toLowerCase().includes(query) ||
      e.sender_email.toLowerCase().includes(query)
    )
  }, [panel.emails, searchQuery])

  // ── Checkbox management ──
  const toggleSelect = useCallback((emailId: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev)
      if (next.has(emailId)) next.delete(emailId)
      else next.add(emailId)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedEmails(new Set(panel.emails.map(e => e.id)))
  }, [panel.emails])

  const clearSelection = useCallback(() => {
    setSelectedEmails(new Set())
  }, [])

  // ── Bulk actions ──
  const runBulkAction = useCallback(async (action: 'summarize' | 'read' | 'unread'): Promise<string | null> => {
    if (selectedEmails.size === 0) return null
    try {
      const result = await gmailPost<{ success: boolean; summary?: string }>('/api/gmail/bulk-action', {
        action,
        emailIds: Array.from(selectedEmails)
      })

      if (action === 'read' || action === 'unread') {
        // Update local email items is_unread flag
        setPanel(p => ({
          ...p,
          emails: p.emails.map(e =>
            selectedEmails.has(e.id) ? { ...e, is_unread: action === 'unread' } : e
          )
        }))
        clearSelection()
      }

      return result.summary || null
    } catch (err) {

      return null
    }
  }, [selectedEmails, clearSelection])

  // ── Mark as read (single) ──
  const markAsRead = useCallback(async (emailId: string) => {
    try {
      await fetch(`/api/gmail/emails/${emailId}/read`, { method: 'POST' })
      setPanel(p => ({
        ...p,
        emails: p.emails.map(e => e.id === emailId ? { ...e, is_unread: false } : e)
      }))
    } catch {
      // Ignore
    }
  }, [])

  // ── Smart compose streaming AI reply ──
  const smartCompose = useCallback(async (emailBody: string, tone = 'Professional', prompt = '') => {
    setSmartComposeLoading(true)
    setSmartComposeText('')

    try {
      const response = await fetch('/api/gmail/smart-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailBody, tone, prompt })
      })

      if (!response.ok) {

        return
      }
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ""

        for (const line of lines) {
          const cleanLine = line.trim()
          if (cleanLine.startsWith("data: ")) {
            try {
              const data = JSON.parse(cleanLine.slice(6))
              if (data.type === "token" && data.text) {
                setSmartComposeText(prev => prev + data.text)
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch (err) {

    } finally {
      setSmartComposeLoading(false)
    }
  }, [])

  // ── Thread intelligence ──
  const fetchThread = useCallback(async (threadId: string) => {
    setThreadLoading(true)
    setActiveThreadId(threadId)
    setThreadMessages([])
    setThreadBrief('')

    try {
      const response = await fetch(`/api/gmail/thread/${threadId}`)
      if (response.ok) {
        const data = await response.json()
        setThreadMessages(data.messages || [])
        setThreadBrief(data.brief || '')
      }
    } catch (err) {

    } finally {
      setThreadLoading(false)
    }
  }, [])

  // ── Scheduled Sends API ──
  const fetchScheduledSends = useCallback(async () => {
    try {
      const response = await fetch('/api/gmail/scheduled')
      if (response.ok) {
        const data = await response.json()
        setScheduledSends(data.scheduledSends || [])
      }
    } catch {
      // Ignore
    }
  }, [])

  const scheduleSend = useCallback(async (recipient: string, subject: string, body: string, date: string) => {
    if (!connectionStatus.connection?.gmail_email) return false
    try {
      const res = await fetch('/api/gmail/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gmailEmail: connectionStatus.connection.gmail_email,
          recipientEmail: recipient,
          subject,
          body,
          scheduledAt: date
        })
      })
      if (res.ok) {
        await fetchScheduledSends()
        return true
      }
    } catch (err) {

    }
    return false
  }, [connectionStatus, fetchScheduledSends])

  const cancelScheduled = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/gmail/schedule/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchScheduledSends()
        return true
      }
    } catch (err) {

    }
    return false
  }, [fetchScheduledSends])

  // ── Contact intelligence ──
  const fetchContactIntel = useCallback(async (email: string) => {
    setContactIntelLoading(true)
    setContactIntel(null)
    try {
      const res = await fetch(`/api/gmail/contact/${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setContactIntel(data)
      }
    } catch {
      // Ignore
    } finally {
      setContactIntelLoading(false)
    }
  }, [])

  return {
    // Connection
    connectionStatus,
    connectionLoading,
    connect,
    reconnect,
    disconnect,

    // Panel
    panel,
    togglePanel,
    fetchEmails,
    selectEmail,
    closePreview,
    setFilter,
    toggleUnreadOnly,
    loadMore,

    // Import
    buildImportText,

    // Client-side search
    searchQuery,
    setSearchQuery,
    filteredEmails,

    // Selection
    selectedEmails,
    toggleSelect,
    selectAll,
    clearSelection,

    // Unread count
    unreadCount,
    markAsRead,

    // Bulk actions
    runBulkAction,

    // Smart compose
    smartCompose,
    smartComposeText,
    smartComposeLoading,
    setSmartComposeText,

    // Threads
    activeThreadId,
    threadMessages,
    threadBrief,
    threadLoading,
    fetchThread,
    setActiveThreadId,

    // Scheduled sends
    scheduledSends,
    fetchScheduledSends,
    scheduleSend,
    cancelScheduled,

    // Contact intelligence
    contactIntel,
    contactIntelLoading,
    fetchContactIntel,
    setContactIntel
  }
}
