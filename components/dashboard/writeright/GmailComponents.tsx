'use client'

// components/dashboard/writeright/GmailComponents.tsx
// All Gmail UI components for the WriteRight page.
// Uses --wr-* CSS tokens for visual consistency.

import { useCallback, useState } from 'react'
import {
  Mail,
  MailOpen,
  X,
  RefreshCw,
  ChevronRight,
  User,
  Inbox,
  Send,
  FileText,
  Sparkles,
  ArrowUpRight,
  Link2Off,
  Clock,
  Filter,
  Wand2,
  MessageSquare,
  Scissors,
  Briefcase,
  Volume2,
  AlignLeft,
  Reply,
} from 'lucide-react'
import type { GmailEmailItem, GmailPanelState, GmailConnectionStatus } from '@/hooks/useGmailIntegration'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GmailAction = 'improve' | 'summarize' | 'rewrite' | 'change_tone' | 'shorten' | 'professionalize' | 'reply'

interface GmailImportHandler {
  (email: GmailEmailItem, action: GmailAction): void
}

// ---------------------------------------------------------------------------
// GmailConnectButton
// ---------------------------------------------------------------------------

export function GmailConnectButton({
  onConnect,
  loading,
}: {
  onConnect: () => void
  loading: boolean
}) {
  return (
    <button
      type="button"
      className="wr-gmail-connect-btn"
      onClick={onConnect}
      disabled={loading}
      aria-label="Connect Gmail account"
    >
      <Mail size={14} />
      {loading ? 'Connecting…' : 'Gmail'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// GmailConnectedBadge (toolbar indicator)
// ---------------------------------------------------------------------------

export function GmailConnectedBadge({
  email,
  onTogglePanel,
  panelOpen,
}: {
  email: string
  onTogglePanel: () => void
  panelOpen: boolean
}) {
  return (
    <button
      type="button"
      className={`wr-gmail-badge${panelOpen ? ' active' : ''}`}
      onClick={onTogglePanel}
      aria-label={`Gmail connected: ${email}. ${panelOpen ? 'Close' : 'Open'} email panel`}
      title={email}
    >
      <MailOpen size={14} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Gmail Action Grid (shown in preview)
// ---------------------------------------------------------------------------

const GMAIL_ACTIONS: Array<{ action: GmailAction; label: string; icon: React.ReactNode }> = [
  { action: 'improve', label: 'Improve', icon: <Wand2 size={14} /> },
  { action: 'reply', label: 'Draft Reply', icon: <Reply size={14} /> },
  { action: 'summarize', label: 'Summarize', icon: <AlignLeft size={14} /> },
  { action: 'rewrite', label: 'Rewrite', icon: <MessageSquare size={14} /> },
  { action: 'shorten', label: 'Shorten', icon: <Scissors size={14} /> },
  { action: 'professionalize', label: 'Professional', icon: <Briefcase size={14} /> },
  { action: 'change_tone', label: 'Change Tone', icon: <Volume2 size={14} /> },
]

// ---------------------------------------------------------------------------
// GmailPanel (email list sidebar)
// ---------------------------------------------------------------------------

export function GmailPanel({
  panel,
  connectionStatus,
  onClose,
  onSelectEmail,
  onRefresh,
  onFilterChange,
  onToggleUnread,
  onLoadMore,
  onDisconnect,
}: {
  panel: GmailPanelState
  connectionStatus: GmailConnectionStatus
  onClose: () => void
  onSelectEmail: (id: string) => void
  onRefresh: () => void
  onFilterChange: (filter: 'INBOX' | 'SENT' | 'DRAFT') => void
  onToggleUnread: () => void
  onLoadMore: () => void
  onDisconnect: () => void
}) {
  const [showDisconnect, setShowDisconnect] = useState(false)

  const filterTabs: Array<{ key: 'INBOX' | 'SENT' | 'DRAFT'; label: string; icon: React.ReactNode }> = [
    { key: 'INBOX', label: 'Inbox', icon: <Inbox size={13} /> },
    { key: 'SENT', label: 'Sent', icon: <Send size={13} /> },
    { key: 'DRAFT', label: 'Drafts', icon: <FileText size={13} /> },
  ]

  return (
    <div className={`wr-gmail-panel${panel.isOpen ? ' open' : ''}`}>
      {/* Header */}
      <div className="wr-gmail-panel-header">
        <div className="wr-gmail-panel-title-row">
          <Mail size={16} />
          <span className="wr-gmail-panel-title">Gmail</span>
          {connectionStatus.connection && (
            <span className="wr-gmail-panel-email">{connectionStatus.connection.gmail_email}</span>
          )}
        </div>
        <div className="wr-gmail-panel-actions">
          <button
            type="button"
            className="wr-gmail-panel-btn"
            onClick={onRefresh}
            disabled={panel.isLoading}
            aria-label="Refresh emails"
          >
            <RefreshCw size={14} className={panel.isLoading ? 'wr-spin' : ''} />
          </button>
          <button
            type="button"
            className="wr-gmail-panel-btn"
            onClick={onClose}
            aria-label="Close Gmail panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="wr-gmail-filters">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`wr-gmail-filter-tab${panel.filter === tab.key ? ' active' : ''}`}
            onClick={() => onFilterChange(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className={`wr-gmail-filter-tab wr-gmail-unread-toggle${panel.unreadOnly ? ' active' : ''}`}
          onClick={onToggleUnread}
          aria-label="Toggle unread only"
        >
          <Filter size={12} />
        </button>
      </div>

      {/* Email list */}
      <div className="wr-gmail-list">
        {panel.error && (
          <div className="wr-gmail-error">
            <span>{panel.error}</span>
            <button type="button" onClick={onRefresh} className="wr-gmail-error-retry">Retry</button>
          </div>
        )}

        {panel.isLoading && panel.emails.length === 0 && (
          <div className="wr-gmail-skeletons">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="wr-gmail-skeleton-row">
                <div className="wr-gmail-skeleton-avatar" />
                <div className="wr-gmail-skeleton-lines">
                  <div className="wr-gmail-skeleton-line" style={{ width: `${60 + (i * 7) % 25}%` }} />
                  <div className="wr-gmail-skeleton-line" style={{ width: `${40 + (i * 11) % 35}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!panel.isLoading && panel.emails.length === 0 && !panel.error && (
          <div className="wr-gmail-empty">
            <Inbox size={24} />
            <p>No emails found</p>
          </div>
        )}

        {panel.emails.map(email => (
          <button
            key={email.id}
            type="button"
            className={`wr-gmail-email-row${email.is_unread ? ' unread' : ''}${panel.selectedEmail?.id === email.id ? ' selected' : ''}`}
            onClick={() => onSelectEmail(email.id)}
          >
            <div className="wr-gmail-email-sender">
              <User size={12} />
              <span className="wr-gmail-email-sender-name">{email.sender_name}</span>
              <span className="wr-gmail-email-time">{formatRelativeTime(email.timestamp)}</span>
            </div>
            <div className="wr-gmail-email-subject">{email.subject}</div>
            <div className="wr-gmail-email-snippet">{email.snippet}</div>
            <ChevronRight size={14} className="wr-gmail-email-chevron" />
          </button>
        ))}

        {panel.nextPageToken && (
          <button
            type="button"
            className="wr-gmail-load-more"
            onClick={onLoadMore}
            disabled={panel.isLoading}
          >
            {panel.isLoading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      {/* Footer — disconnect */}
      <div className="wr-gmail-panel-footer">
        {!showDisconnect ? (
          <button
            type="button"
            className="wr-gmail-disconnect-trigger"
            onClick={() => setShowDisconnect(true)}
          >
            <Link2Off size={12} />
            Disconnect
          </button>
        ) : (
          <div className="wr-gmail-disconnect-confirm">
            <span>Disconnect Gmail?</span>
            <button
              type="button"
              className="wr-gmail-disconnect-yes"
              onClick={() => { setShowDisconnect(false); onDisconnect() }}
            >
              Yes
            </button>
            <button
              type="button"
              className="wr-gmail-disconnect-no"
              onClick={() => setShowDisconnect(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GmailEmailPreview (full email preview overlay)
// ---------------------------------------------------------------------------

export function GmailEmailPreview({
  email,
  onClose,
  onImport,
}: {
  email: GmailEmailItem
  onClose: () => void
  onImport: GmailImportHandler
}) {
  const handleAction = useCallback((action: GmailAction) => {
    onImport(email, action)
    onClose()
  }, [email, onImport, onClose])

  return (
    <div className="wr-gmail-preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Email preview">
      <div className="wr-gmail-preview" onClick={(e) => e.stopPropagation()}>
        {/* Preview Header */}
        <div className="wr-gmail-preview-header">
          <div className="wr-gmail-preview-meta">
            <div className="wr-gmail-preview-sender-row">
              <div className="wr-gmail-preview-avatar">
                {email.sender_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="wr-gmail-preview-sender-name">{email.sender_name}</div>
                <div className="wr-gmail-preview-sender-email">{email.sender_email}</div>
              </div>
            </div>
            <div className="wr-gmail-preview-timestamp">
              <Clock size={12} />
              {formatFullDate(email.timestamp)}
            </div>
          </div>
          <button type="button" className="wr-gmail-preview-close" onClick={onClose} aria-label="Close preview">
            <X size={16} />
          </button>
        </div>

        {/* Subject */}
        <h2 className="wr-gmail-preview-subject">{email.subject}</h2>

        {/* Body */}
        <div className="wr-gmail-preview-body">
          {email.body_plain || email.snippet}
        </div>

        {/* Word count indicator */}
        <div className="wr-gmail-preview-stats">
          <span>{email.word_count} words</span>
        </div>

        {/* Action Grid */}
        <div className="wr-gmail-preview-actions-label">
          <Sparkles size={12} />
          Import into WriteRight
        </div>
        <div className="wr-gmail-actions-grid">
          {GMAIL_ACTIONS.map(({ action, label, icon }) => (
            <button
              key={action}
              type="button"
              className="wr-gmail-action-btn"
              onClick={() => handleAction(action)}
              aria-label={`${label} this email`}
            >
              {icon}
              <span>{label}</span>
              <ArrowUpRight size={10} className="wr-gmail-action-arrow" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utility: Relative time formatting
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatFullDate(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return timestamp
  }
}
