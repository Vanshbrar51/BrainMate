'use client'

// hooks/useGmailIntegration.ts
// Self-contained client hook for Gmail integration.
// Manages connection status, email listing, panel state, and import actions.
// Completely isolated from WriteRight's core state.

import { useState, useCallback, useEffect, useRef } from 'react'

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
    throw new Error(body.message ?? `Gmail API error ${res.status}`)
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
    throw new Error(data.message ?? `Gmail API error ${res.status}`)
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

  // ── Connect Gmail ──
  const connect = useCallback(async () => {
    setConnectionLoading(true)
    try {
      const { url } = await gmailGet<{ url: string }>('/api/gmail/connect')
      // Navigate to Google OAuth screen
      window.location.href = url
    } catch {
      setConnectionLoading(false)
    }
  }, [])

  // ── Disconnect Gmail ──
  const disconnect = useCallback(async () => {
    setConnectionLoading(true)
    try {
      await gmailPost('/api/gmail/disconnect')
      setConnectionStatus({ connected: false, connection: null })
      setPanel(p => ({ ...p, isOpen: false, emails: [], selectedEmail: null, previewOpen: false }))
    } catch {
      // Ignore — status will be re-checked next time
    } finally {
      setConnectionLoading(false)
    }
  }, [])

  // ── Handle OAuth redirect result ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail_connected') === 'true') {
      // Re-check status after redirect
      void (async () => {
        try {
          const status = await gmailGet<GmailConnectionStatus>('/api/gmail/status')
          setConnectionStatus(status)
        } catch { /* noop */ }
      })()
      // Clean up URL params
      const url = new URL(window.location.href)
      url.searchParams.delete('gmail_connected')
      window.history.replaceState({}, '', url.toString())
    }
    if (params.get('gmail_error')) {
      setPanel(p => ({ ...p, error: `Gmail connection failed: ${params.get('gmail_error')}` }))
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
      setPanel(p => ({ ...p, isLoading: false, error: msg }))
    }
  }, [panel.filter, panel.unreadOnly])

  // ── Toggle Panel Open ──
  const togglePanel = useCallback(() => {
    setPanel(p => {
      const willOpen = !p.isOpen
      // Auto-fetch when opening if no emails loaded yet
      if (willOpen && p.emails.length === 0 && connectionStatus.connected) {
        // Schedule fetch after state update
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

    // Fetch full email for audit logging + full body
    try {
      const { email } = await gmailGet<{ email: GmailEmailItem }>(`/api/gmail/emails/${emailId}`)
      setPanel(p => ({ ...p, selectedEmail: email, previewOpen: true }))
    } catch {
      // Use cached version if full fetch fails
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

  // ── Build import text for the WriteRight composer ──
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
      email.body_plain,
    ].join('\n')

    return `${prefixes[action]}${emailContent}`
  }, [])

  return {
    // Connection
    connectionStatus,
    connectionLoading,
    connect,
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
  }
}
