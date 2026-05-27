'use client'

// components/dashboard/writeright/GmailComponents.tsx
// All Gmail UI components for the WriteRight page (enhanced version).
// Fully supports Smart Compose, Thread Accordions, Scheduled Sends, Contact Card overlays, and Bulk Actions.

import React, { useCallback, useState, useEffect, useMemo } from 'react'
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
  Calendar,
  Plus,
  Trash2,
  ChevronLeft,
  Search,
  UserCheck,
  CheckCircle2
} from 'lucide-react'
import type { GmailEmailItem, GmailPanelState, GmailConnectionStatus } from '@/hooks/useGmailIntegration'
import type { ScheduledSend, ContactIntel } from '@/types/writeright'
import { classifyEmail, emailToAvatarColor, getInitials } from '@/lib/gmail-classifier'

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
// GmailConnectedBadge (toolbar indicator with unread count & pulse)
// ---------------------------------------------------------------------------

export function GmailConnectedBadge({
  email,
  onTogglePanel,
  panelOpen,
  unreadCount,
}: {
  email: string
  onTogglePanel: () => void
  panelOpen: boolean
  unreadCount: number
}) {
  const [pulse, setPulse] = useState(false)
  const prevCount = React.useRef(unreadCount)

  // Trigger pulse effect when unreadCount increases
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 2000)
      return () => clearTimeout(timer)
    }
    prevCount.current = unreadCount
  }, [unreadCount])

  return (
    <button
      type="button"
      className={`wr-gmail-badge relative${panelOpen ? ' active' : ''}`}
      onClick={onTogglePanel}
      aria-label={`Gmail connected: ${email}. ${unreadCount} unread. ${panelOpen ? 'Close' : 'Open'} email panel`}
      title={`Connected: ${email} · ${unreadCount} unread`}
    >
      <MailOpen size={14} />
      {unreadCount > 0 && (
        <span className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--wr-error)] text-[9px] font-bold text-white ${pulse ? 'animate-ping' : ''}`}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Gmail Action Grid
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
// Label styling helper for vibrant, curated priorities
// ---------------------------------------------------------------------------
function getLabelStyles(label: string): React.CSSProperties {
  switch (label) {
    case 'URGENT':
      return {
        color: 'var(--wr-error)',
        backgroundColor: 'rgba(192, 57, 43, 0.08)',
        border: '1px solid rgba(192, 57, 43, 0.15)',
      }
    case 'ACTION_REQUIRED':
      return {
        color: 'var(--wr-warning)',
        backgroundColor: 'rgba(183, 121, 31, 0.08)',
        border: '1px solid rgba(183, 121, 31, 0.15)',
      }
    case 'CLIENT':
      return {
        color: 'var(--wr-success)',
        backgroundColor: 'rgba(45, 106, 79, 0.08)',
        border: '1px solid rgba(45, 106, 79, 0.15)',
      }
    case 'NEWSLETTER':
    case 'FYI':
    default:
      return {
        color: 'var(--wr-text-3)',
        backgroundColor: 'var(--wr-surface-2)',
        border: '1px solid var(--wr-border)',
      }
  }
}

// ---------------------------------------------------------------------------
// GmailPanel (with search, compose, checkbox selections, scheduled sends tab)
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
  searchQuery,
  setSearchQuery,
  selectedEmails,
  onToggleSelect,
  unreadCount,
  onOpenCompose,
  scheduledSends,
  onCancelScheduled,
  onViewContact,
  activeFilter,
  setActiveFilter,
  onFetchScheduled
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
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedEmails: Set<string>
  onToggleSelect: (id: string) => void
  unreadCount: number
  onOpenCompose: () => void
  scheduledSends: ScheduledSend[]
  onCancelScheduled: (id: string) => void
  onViewContact: (email: string) => void
  activeFilter: 'INBOX' | 'SENT' | 'DRAFT' | 'SCHEDULED'
  setActiveFilter: (filter: 'INBOX' | 'SENT' | 'DRAFT' | 'SCHEDULED') => void
  onFetchScheduled: () => void
}) {
  const [showDisconnect, setShowDisconnect] = useState(false)

  // Fetch scheduled when active tab switches to SCHEDULED
  useEffect(() => {
    if (activeFilter === 'SCHEDULED') {
      onFetchScheduled()
    }
  }, [activeFilter, onFetchScheduled])

  // Filter lists client-side
  const filteredEmails = useMemo(() => {
    if (!searchQuery.trim()) return panel.emails
    const q = searchQuery.toLowerCase()
    return panel.emails.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.sender_name.toLowerCase().includes(q) ||
      e.sender_email.toLowerCase().includes(q)
    )
  }, [panel.emails, searchQuery])

  // Render SVGs for empty states
  const renderEmptyState = () => {
    if (activeFilter === 'INBOX') {
      return (
        <div className="wr-gmail-empty flex flex-col items-center justify-center gap-3 py-12 text-center text-[var(--wr-text-3)]">
          <svg className="w-12 h-12 stroke-current opacity-70" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--wr-text-2)]">You're all caught up!</p>
            <p className="text-xs">No emails left in your inbox</p>
          </div>
        </div>
      )
    }
    if (activeFilter === 'SENT') {
      return (
        <div className="wr-gmail-empty flex flex-col items-center justify-center gap-3 py-12 text-center text-[var(--wr-text-3)]">
          <svg className="w-12 h-12 stroke-current opacity-70" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--wr-text-2)]">No sent emails</p>
            <p className="text-xs">Send correspondence to get started</p>
          </div>
        </div>
      )
    }
    if (activeFilter === 'SCHEDULED') {
      return (
        <div className="wr-gmail-empty flex flex-col items-center justify-center gap-3 py-12 text-center text-[var(--wr-text-3)]">
          <svg className="w-12 h-12 stroke-current opacity-70" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--wr-text-2)]">No scheduled emails</p>
            <p className="text-xs">Defer emails to send them later</p>
          </div>
        </div>
      )
    }
    return (
      <div className="wr-gmail-empty flex flex-col items-center justify-center gap-3 py-12 text-center text-[var(--wr-text-3)]">
        <svg className="w-12 h-12 stroke-current opacity-70" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-[var(--wr-text-2)]">No drafts</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`wr-gmail-panel${panel.isOpen ? ' open' : ''}`}>
      {/* Header Overhaul */}
      <div className="wr-gmail-panel-header justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Mail size={16} className="text-[var(--wr-accent)] flex-shrink-0" />
          <span className="wr-gmail-panel-title truncate font-semibold">Gmail</span>
          {connectionStatus.connection && (
            <span className="text-[10px] text-[var(--wr-text-3)] truncate max-w-[100px] font-mono" title={connectionStatus.connection.gmail_email}>
              {connectionStatus.connection.gmail_email.split('@')[0]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            className="wr-gmail-panel-btn"
            onClick={onRefresh}
            disabled={panel.isLoading}
            aria-label="Refresh emails"
          >
            <RefreshCw size={14} className={panel.isLoading ? 'animate-spin' : ''} />
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

      {/* Compose Trigger & Search Bar Overhaul */}
      <div className="p-3.5 border-b border-[var(--wr-border-soft)] flex flex-col gap-2.5 bg-[var(--wr-surface)]">
        <button 
          onClick={onOpenCompose}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-[var(--wr-accent)] hover:bg-[var(--wr-accent-hover)] text-white font-semibold text-xs rounded-full transition-all duration-150 shadow-sm hover:shadow"
        >
          <Plus size={14} /> Compose Email
        </button>
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder="Search sender or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="wr-gmail-search-input"
          />
          <Search size={12} className="absolute left-2.5 text-[var(--wr-text-3)]" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              className="absolute right-2.5 text-[var(--wr-text-3)] hover:text-[var(--wr-text-1)] text-[10px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="wr-gmail-filters flex overflow-x-auto gap-1 p-2 bg-[var(--wr-surface-2)]">
        <button
          type="button"
          className={`wr-gmail-filter-tab ${activeFilter === 'INBOX' ? 'active' : ''}`}
          onClick={() => { setActiveFilter('INBOX'); onFilterChange('INBOX') }}
        >
          <Inbox size={12} /> Inbox {unreadCount > 0 && <span className="text-[10px] bg-[var(--wr-error)] text-white px-1.5 py-0.5 rounded-full font-bold">{unreadCount}</span>}
        </button>
        <button
          type="button"
          className={`wr-gmail-filter-tab ${activeFilter === 'SENT' ? 'active' : ''}`}
          onClick={() => { setActiveFilter('SENT'); onFilterChange('SENT') }}
        >
          <Send size={12} /> Sent
        </button>
        <button
          type="button"
          className={`wr-gmail-filter-tab ${activeFilter === 'DRAFT' ? 'active' : ''}`}
          onClick={() => { setActiveFilter('DRAFT'); onFilterChange('DRAFT') }}
        >
          <FileText size={12} /> Drafts
        </button>
        <button
          type="button"
          className={`wr-gmail-filter-tab ${activeFilter === 'SCHEDULED' ? 'active' : ''}`}
          onClick={() => setActiveFilter('SCHEDULED')}
        >
          <Clock size={12} /> Scheduled
        </button>
      </div>

      {/* Email List Content */}
      <div className="wr-gmail-list flex-1 overflow-y-auto wr-gmail-scroll">
        {panel.isLoading && (
          <div className="wr-gmail-skeletons p-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="wr-gmail-skeleton-row flex gap-3 mb-4">
                <div className="wr-gmail-skeleton-avatar w-8 h-8 rounded-full bg-[var(--wr-surface-2)]" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3 w-2/3 bg-[var(--wr-surface-2)] rounded" />
                  <div className="h-3 w-1/2 bg-[var(--wr-surface-2)] rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!panel.isLoading && activeFilter === 'SCHEDULED' && (
          <div className="p-2 flex flex-col gap-2">
            {scheduledSends.length === 0 ? renderEmptyState() : (
              scheduledSends.map(send => (
                <div key={send.id} className="p-3 bg-[var(--wr-surface)] border border-[var(--wr-border)] rounded-md flex flex-col gap-2 relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--wr-text)]">{send.subject}</h4>
                      <span className="text-[10px] text-[var(--wr-text-3)] block mt-0.5">To: {send.recipient_email}</span>
                    </div>
                    <button 
                      onClick={() => onCancelScheduled(send.id)}
                      className="p-1 hover:bg-red-50 text-[var(--wr-error)] rounded text-xs"
                      title="Cancel Schedule"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--wr-text-2)] line-clamp-2">{send.body}</p>
                  <div className="flex justify-between items-center text-[9px] border-t border-[var(--wr-border-soft)] pt-2 text-[var(--wr-text-3)]">
                    <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase">{send.status}</span>
                    <span>Send at: {new Date(send.scheduled_at).toLocaleDateString()} {new Date(send.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!panel.isLoading && activeFilter !== 'SCHEDULED' && filteredEmails.length === 0 && renderEmptyState()}

        {!panel.isLoading && activeFilter !== 'SCHEDULED' && filteredEmails.map((email: GmailEmailItem) => {
          const classification = classifyEmail(email.subject, email.snippet, email.is_unread, email.sender_email)
          const isSelected = selectedEmails.has(email.id)
          const initials = getInitials(email.sender_name)
          const avatarColor = emailToAvatarColor(email.sender_email)

          return (
            <div 
              key={email.id} 
              className={`wr-gmail-email-row flex items-start gap-3 p-3 border-b border-[var(--wr-border-soft)] group relative transition-all duration-150 hover:scale-[1.01] hover:translate-x-0.5 hover:shadow-sm ${email.is_unread ? 'unread bg-[var(--wr-accent-soft)]' : ''} ${panel.selectedEmail?.id === email.id ? 'selected bg-[var(--wr-surface-3)]' : ''}`}
            >
              {/* Checkbox */}
              <div className="flex items-center self-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(email.id)}
                  className="wr-gmail-email-checkbox"
                />
              </div>

              {/* Hashed Color Avatar */}
              <div 
                className="wr-gmail-sender-avatar flex-shrink-0 self-center cursor-pointer"
                style={{ backgroundColor: avatarColor }}
                onClick={() => onViewContact(email.sender_email)}
                title="View relationship data"
              >
                {initials}
              </div>

              {/* Email Content Details */}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelectEmail(email.id)}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-[var(--wr-text)] truncate max-w-[130px]">{email.sender_name}</span>
                  <span className="text-[10px] text-[var(--wr-text-3)] font-mono">{formatRelativeTime(email.timestamp)}</span>
                </div>
                
                {/* Priority Score Dots & Label Badge */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="wr-gmail-priority-dots">
                    {[1, 2, 3, 4, 5].map(dot => (
                      <span 
                        key={dot} 
                        className={`wr-gmail-priority-dot ${dot <= classification.priority ? 'filled' : ''}`} 
                      />
                    ))}
                  </div>
                  {classification.label !== 'NONE' && (
                    <span 
                      className="wr-gmail-label-badge" 
                      style={getLabelStyles(classification.label)}
                    >
                      {classification.label.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <div className="text-xs font-semibold text-[var(--wr-text)] truncate">{email.subject}</div>
                <div className="text-[11px] text-[var(--wr-text-3)] truncate mt-0.5">{email.snippet}</div>
              </div>
              <ChevronRight size={14} className="wr-gmail-email-chevron self-center opacity-0 group-hover:opacity-100 text-[var(--wr-text-3)]" />
            </div>
          )
        })}
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
// GmailEmailPreview (with Smart Compose reply stream, translate, Similar emails, Urgency rating)
// ---------------------------------------------------------------------------

export function GmailEmailPreview({
  email,
  onClose,
  onImport,
  onViewContact,
  smartComposeText,
  smartComposeLoading,
  onRunSmartCompose,
  onClearSmartCompose,
  onUseDraft,
  emailsList,
}: {
  email: GmailEmailItem
  onClose: () => void
  onImport: GmailImportHandler
  onViewContact: (email: string) => void
  smartComposeText: string
  smartComposeLoading: boolean
  onRunSmartCompose: (body: string, tone: string, prompt: string) => void
  onClearSmartCompose: () => void
  onUseDraft: (text: string) => void
  emailsList: GmailEmailItem[]
}) {
  const [smartComposeTone, setSmartComposeTone] = useState('Professional')
  const [smartComposePrompt, setSmartComposePrompt] = useState('')
  const [showSmartCompose, setShowSmartCompose] = useState(false)

  const handleAction = useCallback((action: GmailAction) => {
    onImport(email, action)
    onClose()
  }, [email, onImport, onClose])

  // Client-side similar emails (from same sender)
  const similarEmails = useMemo(() => {
    return emailsList
      .filter(e => e.sender_email === email.sender_email && e.id !== email.id)
      .slice(0, 3)
  }, [emailsList, email.sender_email, email.id])

  // AI Meeting Detector logic
  const isMeetingEmail = /meeting|schedule|invite|zoom|call|google meet|meet up|sync|appointment/i.test(email.body_plain || email.snippet)
  
  // Calculate reading time: avg 200 words per minute
  const readingTime = Math.max(1, Math.round((email.body_plain || email.snippet || "").split(/\s+/).length / 200))

  const classification = classifyEmail(email.subject, email.snippet, email.is_unread, email.sender_email)

  return (
    <div className="wr-gmail-preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Email preview">
      <div className="wr-gmail-preview flex flex-col max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        
        {/* Top Meta info */}
        <div className="wr-gmail-preview-header flex-shrink-0 border-b border-[var(--wr-border-soft)] pb-3 mb-3 flex items-center justify-between">
          <div className="wr-gmail-preview-meta flex items-center gap-3">
            <div 
              className="wr-gmail-preview-avatar w-10 h-10 rounded-full flex items-center justify-center text-white font-bold cursor-pointer"
              style={{ backgroundColor: emailToAvatarColor(email.sender_email) }}
              onClick={() => onViewContact(email.sender_email)}
              title="View relationship information"
            >
              {getInitials(email.sender_name)}
            </div>
            <div>
              <div className="wr-gmail-preview-sender-name font-bold text-sm text-[var(--wr-text)]">{email.sender_name}</div>
              <div className="wr-gmail-preview-sender-email text-xs text-[var(--wr-text-3)]">{email.sender_email}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--wr-text-3)]">🕒 {readingTime} min read</span>
            <button 
              onClick={() => onViewContact(email.sender_email)}
              className="text-xs font-semibold px-2.5 py-1 bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] hover:bg-[var(--wr-border-soft)] rounded-md border border-[var(--wr-border)]"
            >
              Contact Card
            </button>
            <button type="button" className="wr-gmail-preview-close" onClick={onClose} aria-label="Close preview">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Priority & Urgency Score badge */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs bg-[var(--wr-surface-2)] px-2 py-0.5 rounded font-bold text-[var(--wr-text-2)]">
            Urgency Rating: {classification.priority}/5
          </span>
          {classification.label !== 'NONE' && (
            <span 
              className="wr-gmail-label-badge font-bold text-[10px] px-2 py-0.5 rounded"
              style={getLabelStyles(classification.label)}
            >
              {classification.label.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Subject */}
        <h2 className="wr-gmail-preview-subject text-lg font-bold text-[var(--wr-text)] mb-3">{email.subject}</h2>

        {/* Body content */}
        <div className="wr-gmail-preview-body text-sm text-[var(--wr-text-2)] leading-relaxed whitespace-pre-wrap flex-1 min-h-[100px] border border-[var(--wr-border-soft)] rounded-lg p-4 bg-[var(--wr-surface-3)] mb-4">
          {email.body_plain || email.snippet}
        </div>

        {/* Meeting alert card */}
        {isMeetingEmail && (
          <div className="mb-4 bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-500 p-3 rounded flex items-start gap-3">
            <Calendar className="text-blue-500 flex-shrink-0 mt-0.5" size={16} />
            <div>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block">Meeting Request Detected</span>
              <p className="text-xs text-[var(--wr-text-2)] mt-0.5">This email suggests coordination for a phone call or meeting. Click "Draft Reply" to propose meeting time slots.</p>
            </div>
          </div>
        )}

        {/* Interactive Smart Compose Area */}
        <div className="mb-4">
          <button 
            onClick={() => { setShowSmartCompose(!showSmartCompose); onClearSmartCompose() }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--wr-accent-soft)] text-[var(--wr-accent)] font-semibold text-xs rounded-full border border-[var(--wr-accent)]"
          >
            ⚡ {showSmartCompose ? 'Hide Smart Compose' : 'Smart Compose Reply'}
          </button>
          
          {showSmartCompose && (
            <div className="wr-gmail-compose-container mt-3">
              <div className="flex gap-2 mb-2">
                {['Professional', 'Friendly', 'Concise', 'Academic', 'Assertive'].map(t => (
                  <button
                    key={t}
                    onClick={() => setSmartComposeTone(t)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      smartComposeTone === t 
                        ? 'bg-[var(--wr-accent)] text-white border-[var(--wr-accent)]' 
                        : 'bg-[var(--wr-surface)] text-[var(--wr-text-3)] border-[var(--wr-border)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Describe what you want to say in reply (e.g. Agree to project proposal but hold payment terms)..."
                value={smartComposePrompt}
                onChange={(e) => setSmartComposePrompt(e.target.value)}
                className="wr-gmail-compose-prompt"
              />
              
              {smartComposeText && (
                <div className="wr-gmail-compose-stream border border-[var(--wr-border)] mt-2">
                  {smartComposeText}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-[var(--wr-border-soft)] pt-3 mt-2">
                <button
                  onClick={() => { setShowSmartCompose(false); onClearSmartCompose() }}
                  className="px-3 py-1.5 bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] text-xs font-semibold rounded-full"
                >
                  Cancel
                </button>
                {smartComposeText ? (
                  <button
                    onClick={() => {
                      onUseDraft(smartComposeText)
                      setShowSmartCompose(false)
                      onClearSmartCompose()
                    }}
                    className="px-4 py-1.5 bg-[var(--wr-success)] text-white text-xs font-semibold rounded-full"
                  >
                    Use Draft in WriteRight
                  </button>
                ) : (
                  <button
                    onClick={() => onRunSmartCompose(email.body_plain || email.snippet, smartComposeTone, smartComposePrompt)}
                    disabled={smartComposeLoading}
                    className="px-4 py-1.5 bg-[var(--wr-accent)] text-white text-xs font-semibold rounded-full"
                  >
                    {smartComposeLoading ? 'Generating...' : 'Draft Reply'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Similar Emails Section */}
        {similarEmails.length > 0 && (
          <div className="mb-4 border-t border-[var(--wr-border-soft)] pt-3">
            <span className="text-[10px] font-bold text-[var(--wr-text-3)] uppercase tracking-wider block mb-2">Similar Emails from Sender</span>
            <div className="flex flex-col gap-2">
              {similarEmails.map((se: GmailEmailItem) => (
                <div 
                  key={se.id} 
                  onClick={() => onClose()}
                  className="p-2 border border-[var(--wr-border)] rounded hover:bg-[var(--wr-surface-2)] cursor-pointer text-xs"
                >
                  <div className="font-semibold text-[var(--wr-text)]">{se.subject}</div>
                  <div className="text-[10px] text-[var(--wr-text-3)] mt-0.5">{se.snippet}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Grid */}
        <div className="wr-gmail-preview-actions-label mt-auto border-t border-[var(--wr-border-soft)] pt-3 text-[11px] text-[var(--wr-text-3)] uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
          <Sparkles size={12} />
          Import into WriteRight
        </div>
        <div className="wr-gmail-actions-grid flex flex-wrap gap-2 pb-2">
          {GMAIL_ACTIONS.map(({ action, label, icon }) => (
            <button
              key={action}
              type="button"
              className="wr-gmail-action-btn flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[var(--wr-border)] rounded-md hover:bg-[var(--wr-surface-2)] text-[var(--wr-text-2)]"
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
// GmailContactCard (Slides in from right containing statistics and summary)
// ---------------------------------------------------------------------------

export function GmailContactCard({
  intel,
  loading,
  onClose,
}: {
  intel: ContactIntel | null
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="wr-gmail-contact-card">
      <div className="flex justify-between items-center border-b border-[var(--wr-border-soft)] pb-3">
        <h3 className="text-sm font-bold text-[var(--wr-text)] flex items-center gap-1.5">
          <UserCheck size={16} /> Contact Intelligence
        </h3>
        <button onClick={onClose} className="text-xs text-[var(--wr-text-3)] hover:text-[var(--wr-text)]">✕</button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-xs text-[var(--wr-text-3)]">Analyzing correspondence logs...</div>
      ) : !intel ? (
        <div className="text-center py-10 text-xs text-[var(--wr-text-2)]">No profile details generated.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Avatar details */}
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
              style={{ backgroundColor: emailToAvatarColor(intel.email) }}
            >
              {getInitials(intel.name)}
            </div>
            <div>
              <h4 className="font-bold text-sm text-[var(--wr-text)]">{intel.name}</h4>
              <span className="text-xs text-[var(--wr-text-3)]">{intel.email}</span>
            </div>
          </div>

          {/* Tone badges */}
          <div className="flex flex-wrap gap-1.5">
            {intel.toneBadges.map((badge, idx) => (
              <span key={idx} className="text-[10px] bg-[var(--wr-accent-soft)] text-[var(--wr-accent)] font-semibold px-2 py-0.5 rounded">
                🏷️ {badge}
              </span>
            ))}
          </div>

          {/* Stats details */}
          <div className="flex flex-col gap-2 border-y border-[var(--wr-border-soft)] py-3 text-xs text-[var(--wr-text-2)]">
            <div className="flex justify-between">
              <span>Emails Exchanged:</span>
              <span className="font-bold text-[var(--wr-text)]">{intel.emailsExchanged}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Response Time:</span>
              <span className="font-bold text-[var(--wr-text)]">{intel.avgResponseHours} hours</span>
            </div>
            <div className="flex justify-between">
              <span>Last Contacted:</span>
              <span className="font-bold text-[var(--wr-text)]">{intel.lastContactedDays} days ago</span>
            </div>
          </div>

          {/* Relationship summary */}
          <div className="bg-[var(--wr-surface-2)] p-3 rounded">
            <span className="text-[10px] font-bold text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Relationship Brief</span>
            <p className="text-xs text-[var(--wr-text-2)] leading-relaxed">{intel.aiSummary}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GmailBulkActionBar (Floating bar shown at bottom for checkboxes selected)
// ---------------------------------------------------------------------------

export function GmailBulkActionBar({
  selectedCount,
  onSummarize,
  onClearSelection,
  loading
}: {
  selectedCount: number
  onSummarize: () => void
  onClearSelection: () => void
  loading: boolean
}) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-[var(--wr-surface)] border border-[var(--wr-border-med)] shadow-[var(--wr-shadow-lg)] px-5 py-3 rounded-full flex items-center gap-4 z-50 animate-bounce">
      <span className="text-xs font-semibold text-[var(--wr-text)]">
        🗳️ {selectedCount} emails selected
      </span>
      <div className="h-4 w-px bg-[var(--wr-border-soft)]" />
      <div className="flex gap-2">
        <button
          onClick={onSummarize}
          disabled={loading}
          className="px-3.5 py-1.5 bg-[var(--wr-accent)] hover:bg-[var(--wr-accent-hover)] text-white text-xs font-bold rounded-full transition-all duration-150"
        >
          {loading ? 'Summarizing...' : 'Summarize Selected'}
        </button>
        <button
          onClick={onClearSelection}
          className="px-3 py-1.5 bg-[var(--wr-surface-2)] hover:bg-[var(--wr-border-soft)] text-[var(--wr-text-2)] text-xs font-bold rounded-full"
        >
          Clear
        </button>
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
