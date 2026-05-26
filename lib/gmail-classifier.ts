// lib/gmail-classifier.ts
// Pure client-side email classifier.
// No I/O, no async, no side effects — safe to call on every render.

import type { PriorityScore, EmailLabel, EmailClassification } from '@/types/writeright'

// ---------------------------------------------------------------------------
// Priority scoring keyword tables
// ---------------------------------------------------------------------------

const HIGH_PRIORITY_KEYWORDS: readonly string[] = [
  'urgent', 'asap', 'critical', 'immediately', 'action required',
  'follow up', 'reminder', 'invoice', 'payment', 'deadline', 'overdue',
  'important', 'time sensitive', 'respond by', 'due today', 'final notice',
  'meeting', 'interview', 'offer', 'contract', 'approval',
]

const LOW_PRIORITY_KEYWORDS: readonly string[] = [
  'unsubscribe', 'newsletter', 'no-reply', 'noreply', 'marketing',
  'promotion', 'offer', 'sale', 'discount', 'update from',
]

function computePriorityScore(
  subject: string,
  snippet: string,
  isUnread: boolean,
): PriorityScore {
  const combined = `${subject} ${snippet}`.toLowerCase()
  let score = 2 // baseline

  // High priority signals — +1 if any found
  const highCount = HIGH_PRIORITY_KEYWORDS.filter(kw => combined.includes(kw)).length
  if (highCount >= 1) score += 1
  if (highCount >= 3) score += 1 // escalate further if many signals

  // Unread adds urgency
  if (isUnread) score += 1

  // Low priority reduces
  const hasLow = LOW_PRIORITY_KEYWORDS.some(kw => combined.includes(kw))
  if (hasLow) score -= 1

  // Clamp to 1-5
  return Math.max(1, Math.min(5, score)) as PriorityScore
}

// ---------------------------------------------------------------------------
// Label classification
// ---------------------------------------------------------------------------

const URGENT_SUBJECT_PATTERN = /urgent|asap|critical|emergency/i
const ACTION_PATTERN = /please|could you|can you|action required|kindly|would you|need you to/i
const NEWSLETTER_SNIPPET_PATTERN = /unsubscribe|manage.*preferences|email.*preferences|view.*browser/i
const NEWSLETTER_SENDER_PATTERN = /newsletter|noreply|no-reply|marketing|promotions|offers/i
const PERSONAL_DOMAINS_PATTERN = /gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|aol\.com|icloud\.com|me\.com|live\.com/i

function computeLabel(
  subject: string,
  snippet: string,
  senderEmail: string,
  priority: PriorityScore,
): EmailLabel {
  const combined = `${subject} ${snippet}`

  // URGENT: high priority + urgent keywords in subject
  if (priority >= 4 && URGENT_SUBJECT_PATTERN.test(subject)) {
    return 'URGENT'
  }

  // ACTION_REQUIRED: action language in subject or snippet
  if (ACTION_PATTERN.test(combined)) {
    return 'ACTION_REQUIRED'
  }

  // NEWSLETTER: unsubscribe in snippet or newsletter/noreply in sender
  if (NEWSLETTER_SNIPPET_PATTERN.test(snippet) || NEWSLETTER_SENDER_PATTERN.test(senderEmail)) {
    return 'NEWSLETTER'
  }

  // CLIENT: professional domain sender (not personal)
  if (!PERSONAL_DOMAINS_PATTERN.test(senderEmail) && senderEmail.includes('@')) {
    return 'CLIENT'
  }

  // FYI: low priority personal
  if (priority <= 2) {
    return 'FYI'
  }

  return 'NONE'
}

// ---------------------------------------------------------------------------
// Label color mapping using --wr-* CSS variable references
// ---------------------------------------------------------------------------

const LABEL_COLORS: Record<EmailLabel, string> = {
  URGENT:           'var(--wr-error)',
  ACTION_REQUIRED:  'var(--wr-warning)',
  FYI:              'var(--wr-text-3)',
  NEWSLETTER:       'var(--wr-text-3)',
  CLIENT:           'var(--wr-success)',
  NONE:             'var(--wr-text-3)',
}

// ---------------------------------------------------------------------------
// Avatar color determinism — maps email hash to 8 accent colors
// ---------------------------------------------------------------------------

const AVATAR_COLORS: readonly string[] = [
  '#d97757', // --wr-accent (terracotta)
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#10b981', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
]

export function emailToAvatarColor(email: string): string {
  if (!email) return AVATAR_COLORS[0] ?? '#d97757'
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? '#d97757'
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function classifyEmail(
  subject: string,
  snippet: string,
  isUnread: boolean,
  senderEmail = '',
): EmailClassification {
  const safeSubject = subject ?? ''
  const safeSnippet = snippet ?? ''
  const safeSender = senderEmail ?? ''

  const priority = computePriorityScore(safeSubject, safeSnippet, isUnread)
  const label = computeLabel(safeSubject, safeSnippet, safeSender, priority)

  return {
    priority,
    label,
    labelColor: LABEL_COLORS[label],
  }
}
