'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useHaptics } from "@/lib/haptics"
import { useAuth } from '@clerk/nextjs'
import { useErrorToast } from '@/lib/writeright-toast'
import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Paperclip,
  ImagePlus,
  ArrowUpRight,
  Mail,
  MessageSquare,
  Linkedin,
  Globe,
  Copy,
  Check,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Trash2,
  Plus,
  Share2,
  BookmarkPlus,
  Search,
  X,
  BarChart3,
  LayoutTemplate,
  Layout,
  Pencil,
  Download,
  ThumbsUp,
  ThumbsDown,
  Smile,
  ArrowRight,
  Wand2,
  Volume2,
  VolumeX,
  Settings2,
  Fingerprint,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Columns,
  CheckCheck,
  Maximize2,
  Link2,
} from 'lucide-react'
import {
  WritingMode,
  ToneOption,
  VoiceLang,
  OutputLang,
  AIQualityScores,
  AIJobResult,
  TriageItem,
  TriageResponse,
  WriteRightMessage,
  VoiceExample,
  CoachMetrics,
  GrammarIssue,
} from '@/types/writeright'
import {
  MeetingCard,
  ActionChecklist,
  TriageBoard,
} from '@/components/dashboard/writeright/InteractiveComponents'
import { useGmailIntegration, type GmailEmailItem } from '@/hooks/useGmailIntegration'
import {
  GmailConnectButton,
  GmailConnectedBadge,
  GmailPanel,
  GmailEmailPreview,
} from '@/components/dashboard/writeright/GmailComponents'
import { useWritingPreferences } from '@/hooks/useWritingPreferences'
import { analyzeText } from '@/lib/writing-coach'
import { CoachBar } from '@/components/dashboard/writeright/CoachBar'
import { TemplatePanel } from '@/components/dashboard/writeright/TemplatePanel'
import { AnalyticsView } from '@/components/dashboard/writeright/AnalyticsView'
import { WriteSplitView } from '@/components/dashboard/writeright/WriteSplitView'
import { GrammarOverlay } from '@/components/dashboard/writeright/GrammarOverlay'
import { EmailChainView } from '@/components/dashboard/writeright/EmailChainView'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface CreateChatResponse {
  chat: { id: string; title: string; mode: string }
}

type SubmitMessageResponse =
  | {
    jobId: string
    messageId: string
    status: 'pending'
  }
  | {
    jobId: 'cached'
    messageId: string
    status: 'completed'
    result: AIJobResult
  }

interface ChatListItem {
  id: string
  title: string
  mode: string
  message_count: number
  updated_at: string
}

interface ListChatsResponse {
  chats: ChatListItem[]
  page?: number
  limit?: number
}

interface ChatMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
  created_at?: string
}

interface SearchResultRow {
  chatId: string
  chatTitle: string
  messageSnippet: string
  mode: string
  updatedAt: string
}



interface TemplateRow {
  id: string
  name: string
  content: string
  mode: WritingMode
  tone: ToneOption
  use_count: number
  created_at: string
  updated_at: string
}

interface TemplatesResponse {
  templates: TemplateRow[]
}

interface WriterightStats {
  streak: {
    current: number
    longest: number
    last_activity_date: string | null
  }
  total: number
  mode_breakdown: Array<{ mode: string; count: number; percent: number }>
  tone_breakdown: Array<{ tone: string; count: number; percent: number }>
  weekly_counts: number[]
  achievements: string[]
  avg_clarity_by_day?: number[]
}

interface ShareResponse {
  shareUrl: string
  expiresAt: string
}

interface ExtractResponse {
  text: string
  truncated: boolean
  char_count: number
}

interface SharePayload {
  before: string
  after: string
  mode: WritingMode
  tone: ToneOption
  chatId: string
  jobId: string
}

interface StreamJobHandlers {
  onToken?: (chunk: string) => void
  onStatus?: (stage: string, message: string) => void
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike {
  error?: string
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES: { id: WritingMode; label: string; Icon: React.ElementType; color: string }[] = [
  { id: 'email', label: 'Email', Icon: Mail, color: '#3B82F6' },
  { id: 'paragraph', label: 'Paragraph', Icon: MessageSquare, color: '#F59E0B' },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin, color: '#0A66C2' },
  { id: 'whatsapp', label: 'WhatsApp → Formal', Icon: Globe, color: '#25D366' },
]

const MODE_PROMPTS: Record<WritingMode, { title: string; sub: string; full: string }[]> = {
  email: [
    { title: 'Polish this email draft', sub: 'Improve clarity and professional tone', full: 'Polish this email draft for clarity and professional tone.' },
    { title: 'Write reply to this email', sub: 'Paste email, get a reply written', full: 'Write a professional reply to this email.' },
    { title: 'Fix Indian English', sub: 'Remove "kindly revert", "do the needful"', full: 'Fix Indian English patterns in this text.' },
    { title: 'Make this more formal', sub: 'Upgrade casual email to professional', full: 'Upgrade this casual email to a more professional tone.' },
  ],
  linkedin: [
    { title: 'Write a LinkedIn post', sub: 'Turn my idea into an engaging post', full: 'Turn this idea into an engaging LinkedIn post.' },
    { title: 'Rewrite for LinkedIn', sub: 'More professional and engaging', full: 'Rewrite this for LinkedIn to be more professional and engaging.' },
    { title: 'Add hooks and structure', sub: 'Make it stop the scroll', full: 'Add hooks and structure to make this stop the scroll.' },
    { title: 'Make it less cringe', sub: 'Remove buzzwords and corporate speak', full: 'Make this less cringe by removing buzzwords and corporate speak.' },
  ],
  whatsapp: [
    { title: 'Convert WhatsApp to email', sub: 'Turn this chat into a formal email', full: 'Convert this WhatsApp chat into a formal email.' },
    { title: 'Fix Hinglish to English', sub: 'Clean up mixed Hindi-English text', full: 'Fix Hinglish in this text and convert to proper English.' },
    { title: 'Make this professional', sub: 'Boss-ready version of this message', full: 'Make this WhatsApp message professional and boss-ready.' },
    { title: 'Summarise this thread', sub: '3-line summary of long chat', full: 'Summarise this WhatsApp thread in 3 lines.' },
  ],
  paragraph: [
    { title: 'Create custom paragraph', sub: 'Write a paragraph from an idea', full: 'Create a well-structured paragraph based on this idea.' },
    { title: 'Summarise this text', sub: 'Extract the main points', full: 'Summarise this paragraph and extract the main points.' },
    { title: 'Fix grammar and flow', sub: 'Correct errors and improve readability', full: 'Fix grammar and flow, correct errors and improve readability.' },
    { title: 'Rewrite this paragraph', sub: 'More concise and impactful', full: 'Rewrite this paragraph to be more concise and impactful.' },
  ],
}

const MODE_PLACEHOLDERS: Record<WritingMode, string> = {
  email: 'Paste your email draft or type a request...',
  paragraph: 'Paste your paragraph or type a request...',
  linkedin: 'Paste your LinkedIn draft or type a request...',
  whatsapp: 'Paste your WhatsApp message or chat...',
}

const TONES: readonly ToneOption[] = ['Professional', 'Friendly', 'Concise', 'Academic', 'Assertive']
const TONE_DESCRIPTIONS: Record<ToneOption, string> = {
  Professional: 'Formal, clear, suitable for workplace emails',
  Friendly: 'Warm, approachable — still polished',
  Concise: 'Shortest possible, no filler words',
  Academic: 'Formal vocabulary, citations-style phrasing',
  Assertive: 'Direct, confident, no hedging language',
}

const OUTPUT_LANG_OPTIONS: Array<{ value: OutputLang; label: string }> = [
  { value: 'en', label: 'Keep English' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'tamil', label: 'Tamil' },
  { value: 'marathi', label: 'Marathi' },
  { value: 'bengali', label: 'Bengali' },
  { value: 'telugu', label: 'Telugu' },
]

const VOICE_LANGS: Array<{ id: VoiceLang; label: string }> = [
  { id: 'en-IN', label: 'EN-IN' },
  { id: 'hi-IN', label: 'HI-IN' },
  { id: 'en-US', label: 'AUTO' },
]

const RANT_SIGNALS = [
  '!!!!',
  'HOW DARE',
  'RIDICULOUS',
  'UNACCEPTABLE',
  'fed up',
  'worst',
  'pathetic',
  'incompetent',
  'useless',
  "can't believe",
  'absolutely disgusting',
  'disgrace',
  'waste of time',
] as const

const CHAR_WARN = 8000
const CHAR_LIMIT = 9500
const CHAR_MAX = 10000

const ACHIEVEMENT_META: Record<string, { emoji: string; label: string }> = {
  first_improvement: { emoji: '✅', label: 'First improvement' },
  indian_english_fixer: { emoji: '🇮🇳', label: 'Indian English Fixer' },
  hinglish_hero: { emoji: '🗣️', label: 'Hinglish Hero' },
  power_writer: { emoji: '⚡', label: 'Power Writer' },
  tone_master: { emoji: '🎯', label: 'Tone Master' },
  streak_3: { emoji: '🔥', label: '3-day streak' },
  streak_7: { emoji: '🏆', label: '7-day streak' },
}

// ---------------------------------------------------------------------------
// Helpers & API
// ---------------------------------------------------------------------------

function textStats(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const readSecs = Math.ceil(words / 3.5)
  return { words, readSecs }
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!word) return 0
  if (word.length <= 3) return 1
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
  word = word.replace(/^y/, '')
  const matches = word.match(/[aeiouy]{1,2}/g)
  return matches ? matches.length : 1
}

function computeReadability(text: string) {
  if (!text || text.trim() === '') return { score: 0, label: 'Standard', cls: 'wr-readability-standard' }
  const words = text.trim().split(/\s+/).filter(Boolean)
  const wordCount = words.length || 1

  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1

  let syllableCount = 0
  words.forEach(w => { syllableCount += countSyllables(w) })

  const score = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount))))

  let label = 'Standard'
  let cls = 'wr-readability-standard'

  if (score >= 70) {
    label = 'Easy'
    cls = 'wr-readability-easy'
  } else if (score < 50) {
    label = 'Complex'
    cls = 'wr-readability-complex'
  }

  return { score, label, cls }
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const voiceWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null
}

function isAllCapsWord(word: string): boolean {
  const lettersOnly = word.replace(/[^A-Za-z]/g, '')
  return lettersOnly.length >= 2 && lettersOnly === lettersOnly.toUpperCase()
}

function detectRant(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 30) return false
  const lower = trimmed.toLowerCase()
  const hasSignal = RANT_SIGNALS.some((signal) => lower.includes(signal.toLowerCase()))
  const words = trimmed.split(/\s+/).filter(Boolean)
  const alphaWords = words.filter((word) => /[A-Za-z]/.test(word))
  const upperWords = alphaWords.filter(isAllCapsWord)
  const capsRatio = alphaWords.length > 0 ? upperWords.length / alphaWords.length : 0
  return hasSignal || capsRatio > 0.3
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const source = escapeRegExp(query)
  const pattern = new RegExp(`(${source})`, 'ig')
  const matcher = new RegExp(`^${source}$`, 'i')
  const parts = text.split(pattern)
  return parts.map((part, index) => (
    matcher.test(part)
      ? <span key={`${part}-${index}`} className="wr-search-highlight">{part}</span>
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}

function makeClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isUuidLike(value: string | null | undefined): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function apiPost<T>(
  url: string,
  body: unknown,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string
      code?: string
    }
    const apiError = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string }
    apiError.code = err.code
    throw apiError
  }
  return res.json()
}

async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

async function apiPostForm<T>(url: string, body: FormData): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    body,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string
      code?: string
    }
    const apiError = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string }
    apiError.code = err.code
    throw apiError
  }
  return res.json()
}

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string
      code?: string
    }
    const apiError = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string }
    apiError.code = err.code
    throw apiError
  }
  return res.json()
}

async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
}

async function streamJobResult(
  jobId: string,
  signal: AbortSignal,
  getToken: () => Promise<string | null>,
  handlers?: StreamJobHandlers,
): Promise<AIJobResult> {
  const token = await getToken()
  if (!token) {
    const authError = new Error('Your session expired. Please refresh the page.') as Error & { code?: string }
    authError.code = 'UNAUTHORIZED'
    throw authError
  }

  const res = await fetch(`/api/writeright/job/${jobId}/stream`, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string
      code?: string
    }
    const apiError = new Error(err.error ?? `Stream failed: ${res.status}`) as Error & { code?: string }
    apiError.code = err.code
    throw apiError
  }

  if (!res.body) {
    throw new Error('Stream connection failed. Please try again.')
  }

  const reader = res.body
    .pipeThrough(new TextDecoderStream())
    .getReader()

  let buffer = ''

  const handleEventBlock = (block: string): AIJobResult | null => {
    let eventName = 'message'
    const dataLines: string[] = []

    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    const rawData = dataLines.join('\n')
    if (!rawData) return null

    if (eventName === 'ping' || eventName === 'status') {
      return null
    }

    try {
      if (eventName === 'token') {
        const payload = JSON.parse(rawData) as { chunk?: string }
        if (payload.chunk) handlers?.onToken?.(payload.chunk)
        return null
      }

      if (eventName === 'result') {
        const payload = JSON.parse(rawData) as { result?: AIJobResult }
        if (payload.result) {
          return payload.result
        }
        throw new Error('Empty result')
      }

      if (eventName === 'error') {
        const payload = JSON.parse(rawData) as { error?: string; code?: string }
        const apiError = new Error(payload.error ?? 'Job failed') as Error & { code?: string }
        apiError.code = payload.code
        throw apiError
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to parse stream response')
    }

    return null
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += value.replace(/\r/g, '')

    while (buffer.includes('\n\n')) {
      const separatorIndex = buffer.indexOf('\n\n')
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const result = handleEventBlock(block)
      if (result) {
        return result
      }
    }
  }

  throw new Error('Stream ended before a result was returned.')
}

function useRantDetector(text: string): boolean {
  const [isRanting, setIsRanting] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsRanting(detectRant(text))
    }, 800)
    return () => window.clearTimeout(timer)
  }, [text])

  return isRanting
}

function useVoiceInput({
  input,
  setInput,
  voiceLang,
}: {
  input: string
  setInput: (value: string) => void
  voiceLang: VoiceLang
}) {
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const baseInputRef = useRef('')
  const supported = getSpeechRecognitionConstructor() !== null

  useEffect(() => {
    const RecognitionCtor = getSpeechRecognitionConstructor()
    if (!RecognitionCtor) {
      recognitionRef.current = null
      return
    }

    const recognition = new RecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = voiceLang

    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => {
      setIsRecording(false)
      baseInputRef.current = ''
    }
    recognition.onerror = () => {
      setIsRecording(false)
      baseInputRef.current = ''
    }
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript ?? ''
      }
      const normalizedTranscript = transcript.trim()
      if (!normalizedTranscript) {
        setInput(baseInputRef.current)
        return
      }
      const base = baseInputRef.current
      const needsSpace = base.length > 0 && !/\s$/.test(base)
      setInput(`${base}${needsSpace ? ' ' : ''}${normalizedTranscript}`.trimStart())
    }

    recognitionRef.current = recognition

    return () => {
      recognition.stop()
      recognitionRef.current = null
      setIsRecording(false)
      baseInputRef.current = ''
    }
  }, [setInput, voiceLang])

  const startRecording = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || isRecording) return
    baseInputRef.current = input
    try {
      recognition.start()
    } catch {
      setIsRecording(false)
    }
  }, [input, isRecording])

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || !isRecording) return
    recognition.stop()
  }, [isRecording])

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording()
    else startRecording()
  }, [isRecording, startRecording, stopRecording])

  return { supported, isRecording, toggleRecording, stopRecording }
}

function useTemplates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<TemplatesResponse>('/api/writeright/templates')
      setTemplates(res.templates ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  const createTemplate = useCallback(async (payload: {
    name: string
    content: string
    mode: WritingMode
    tone: ToneOption
  }) => {
    const res = await apiPost<{ template: TemplateRow }>('/api/writeright/templates', payload)
    setTemplates((prev) => [res.template, ...prev])
    return res.template
  }, [])

  const renameTemplate = useCallback(async (id: string, name: string) => {
    const res = await apiPatch<{ template: TemplateRow }>(`/api/writeright/templates/${id}`, { name })
    setTemplates((prev) => prev.map((item) => item.id === id ? res.template : item))
    return res.template
  }, [])

  const deleteTemplate = useCallback(async (id: string) => {
    await apiDelete(`/api/writeright/templates/${id}`)
    setTemplates((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const markUsed = useCallback(async (id: string) => {
    try {
      const res = await apiPost<{ template: { id: string; use_count: number } }>(`/api/writeright/templates/${id}/use`, {})
      setTemplates((prev) => prev.map((item) => (
        item.id === id ? { ...item, use_count: res.template.use_count } : item
      )))
    } catch {
      // Non-blocking.
    }
  }, [])

  return {
    templates,
    loading,
    loadTemplates,
    createTemplate,
    renameTemplate,
    deleteTemplate,
    markUsed,
  }
}

function useWriterightSearch(query: string, enabled: boolean) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultRow[]>([])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    if (!enabled || !debouncedQuery.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiGet<{ results?: SearchResultRow[] }>(
          `/api/writeright/search?q=${encodeURIComponent(debouncedQuery.trim())}`,
          controller.signal
        )
        if (!cancelled) setResults(res.results ?? [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [debouncedQuery, enabled])

  return { loading, results }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const THINKING_MESSAGES = [
  'Analyzing your writing...',
  'Detecting Indian English patterns...',
  'Calibrating tone...',
  'Polishing your draft...',
  'Almost ready...',
] as const

// ── CHANGED: [UI-6] Brain Wave Loading Animation ──
function WriteRightThinking({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = useState(0)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!startTime) return
    const t = setInterval(() => setElapsed(
      Math.floor((Date.now() - startTime) / 1000)
    ), 1000)
    return () => clearInterval(t)
  }, [startTime])

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % THINKING_MESSAGES.length), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="wr-thinking">
      <div className="wr-thinking-avatar">✍️</div>
      <div className="wr-thinking-content">
        <div className="wr-thinking-dots" aria-hidden="true">
          <span className="wr-dot" /><span className="wr-dot" /><span className="wr-dot" />
        </div>
        <span className="wr-thinking-text">
          {THINKING_MESSAGES[idx]}
        </span>
        {elapsed > 7 && (
          <span className="wr-thinking-elapsed">({elapsed}s)</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ENHANCE-01: Animated word-reveal for After text
// ---------------------------------------------------------------------------

function AnimatedAfterText({ text, animate }: { text: string; animate: boolean }) {
  const tokens = text.split(/(\s+)/)
  let wordIdx = 0
  return (
    <span className={`wr-diff-after-text${animate ? ' animating' : ''}`}>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>
        const w = wordIdx++
        return <span key={i} data-w="" style={{ '--w': w } as React.CSSProperties}>{token}</span>
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ENHANCE-02: Animated count-up number
// ---------------------------------------------------------------------------

function AnimatedNumber({ value, duration = 600 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let rafId: number
    const raf = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out-cubic
      setDisplay(Math.round(eased * value))
      if (progress < 1) rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)
    return () => cancelAnimationFrame(rafId)
  }, [value, duration])
  return <>{display}</>
}

function scoreColor(score: number): string {
  if (score >= 8) return 'var(--success)'
  if (score >= 5) return 'var(--warning)'
  return 'var(--error)'
}

function ScoreGauge({
  label,
  value,
  previous,
}: {
  label: string
  value: number
  previous?: number
}) {
  const clamped = Math.max(1, Math.min(10, value))
  const prev = typeof previous === 'number' ? Math.max(1, Math.min(10, previous)) : null
  const delta = prev === null ? 0 : clamped - prev
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const arcRatio = 220 / 360
  const dash = circumference * arcRatio
  const gap = circumference - dash
  const progressOffset = dash - (dash * clamped) / 10

  return (
    <div className="wr-score-gauge" aria-label={`${label}: ${clamped} out of 10`} role="img">
      <div className="wr-gauge-wrap">
        <svg className="wr-gauge-svg" viewBox="0 0 84 84" aria-hidden="true">
          <circle
            className="wr-gauge-track"
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            strokeWidth={6}
            pathLength={circumference}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset="0"
            transform="rotate(-110 42 42)"
          />
          <circle
            className="wr-gauge-arc"
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            strokeWidth={6}
            pathLength={circumference}
            strokeDasharray={`${dash} ${gap}`}
            transform="rotate(-110 42 42)"
            style={
              {
                '--gauge-offset': progressOffset,
                '--gauge-color': scoreColor(clamped),
              } as React.CSSProperties
            }
          />
        </svg>
        <span className="wr-gauge-number"><AnimatedNumber value={clamped} /></span>
        {delta !== 0 && (
          <span className={`wr-gauge-delta ${delta > 0 ? 'pos' : 'neg'}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      <span className="wr-gauge-label">{label}</span>
    </div>
  )
}

function ScoreCard({ scores, prevScores }: { scores?: AIQualityScores; prevScores?: AIQualityScores }) {
  if (!scores) return null

  const rows: Array<{ key: Exclude<keyof AIQualityScores, 'verdict'>; label: string }> = [
    { key: 'clarity', label: 'Clarity' },
    { key: 'tone', label: 'Tone' },
    { key: 'impact', label: 'Impact' },
  ]

  return (
    <div className="wr-score-card">
      <div className="wr-score-gauges">
        {rows.map((row) => (
          <ScoreGauge
            key={row.key}
            label={row.label}
            value={typeof scores[row.key] === 'number' ? scores[row.key] : 0}
            previous={prevScores?.[row.key]}
          />
        ))}
      </div>
      <div className="wr-verdict-row">
        {(() => {
          let verdictCls = 'pbadge-free'
          const v = (scores.verdict || '').toLowerCase()
          if (v.includes('needs work') || v.includes('poor')) verdictCls = 'pbadge-canceled'
          else if (v.includes('good')) verdictCls = 'pbadge-primary'
          else if (v.includes('great') || v.includes('excellent')) verdictCls = 'pbadge-success'
          return <span className={`pbadge ${verdictCls}`}>{scores.verdict || 'Needs more work'}</span>
        })()}
      </div>
    </div>
  )
}

function WriteDiffBlock({
  before,
  after,
  explanation,
  teaching,
  extraction,
  followUp,
  suggestions,
  scores,
  prevScores,
  englishVersion,
  outputLang,
  streaming,
  isMorphing,
  jobId,
  chatId,
  mode,
  tone,
  onSuggest,
  onSaveTemplate,
  onShare,
}: {
  before: string
  after: string
  explanation: string
  teaching?: AIJobResult['teaching']
  extraction?: AIJobResult['extraction']
  followUp?: string
  suggestions?: string[]
  scores?: AIQualityScores
  prevScores?: AIQualityScores
  englishVersion?: string | null
  outputLang?: OutputLang
  streaming?: boolean
  isMorphing?: boolean
  jobId?: string | null
  chatId?: string | null
  mode?: WritingMode
  tone?: ToneOption
  onSuggest?: (text: string) => void
  onSaveTemplate?: () => void
  onShare?: () => void
}) {
  const [feedbackState, setFeedbackState] = useState<'none' | 'up' | 'down'>('none')
  const canCollectFeedback = isUuidLike(jobId) && Boolean(chatId)

  const handleFeedback = useCallback(async (rating: 'up' | 'down') => {
    if (feedbackState !== 'none' || !canCollectFeedback || !chatId) return
    setFeedbackState(rating)
    try {
      await apiPost('/api/writeright/feedback', { jobId, chatId, rating, mode, tone })
    } catch { /* ignore */ }
  }, [canCollectFeedback, chatId, feedbackState, jobId, mode, tone])

  const [beforeExpanded, setBeforeExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showEnglish, setShowEnglish] = useState(false)
  const [showDiff, setShowDiff] = useState(false)

  // Phase 1: Interactive Draft & Selection
  const [workingDraft, setWorkingDraft] = useState(after)
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect | null } | null>(null)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [isRefining, setIsRefining] = useState(false)

  const isLong = before.length > 300
  const renderAfterText = showEnglish && englishVersion ? englishVersion : (showDiff ? workingDraft : after)

  // Selection detection for recursive refinement
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null)
        return
      }
      const text = sel.toString().trim()
      // Only trigger if selection is inside the 'after' text container
      const range = sel.getRangeAt(0)
      const container = range.commonAncestorContainer.parentElement
      if (container && (container.closest('.wr-diff-after-text') || container.closest('.wr-diff-text'))) {
        setSelection({ text, rect: range.getBoundingClientRect() })
      } else {
        setSelection(null)
      }
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  const handleRefine = async () => {
    if (!selection || !refinePrompt.trim() || isRefining) return
    setIsRefining(true)
    try {
      const res = await fetch('/api/writeright/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullText: workingDraft,
          selectedText: selection.text,
          prompt: refinePrompt,
          mode,
          tone
        })
      })
      if (!res.ok) throw new Error('Refine failed')
      const data = await res.json()
      // Replace only the selected segment in the working draft
      setWorkingDraft(prev => prev.replace(selection.text, data.refinedText))
      setSelection(null)
      setRefinePrompt('')
    } catch (err) {
      console.error('Refine error:', err)
    } finally {
      setIsRefining(false)
    }
  }

  const handleCopy = async () => {
    const textToCopy = showDiff ? workingDraft : renderAfterText
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        throw new Error('Clipboard API not available')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = textToCopy
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  const beforeStats = textStats(before)
  const afterStats = textStats(renderAfterText)
  const wordDelta = afterStats.words - beforeStats.words
  const deltaStr = wordDelta === 0 ? '' : wordDelta > 0 ? `+${wordDelta}` : `${wordDelta}`
  const suggestionChips = (suggestions ?? []).map((chip) => chip.trim()).filter(Boolean).slice(0, 3)

  const beforeReadability = computeReadability(before)
  const afterReadability = computeReadability(renderAfterText)

  return (
    <div className={`wr-diff-container${streaming ? ' is-streaming' : ''}${isMorphing ? ' morphing' : ''}`}>
      {!streaming && (
        <div className="wr-diff-before">
          <span className="wr-diff-label">Original Draft</span>
          <div className={`wr-before-text${isLong && !beforeExpanded ? ' clipped' : ''}`}>
            {before}
          </div>
          {isLong && (
            <button className="wr-diff-expand-btn" onClick={() => setBeforeExpanded((v) => !v)}>
              {beforeExpanded
                ? <><ChevronUp size={11} /> Show less</>
                : <><ChevronDown size={11} /> Show all ({before.length} chars)</>
              }
            </button>
          )}
        </div>
      )}

      <div className={`wr-diff-after${copied ? ' wr-just-copied' : ''}`}>
        <div className="wr-diff-header">
          <div className="wr-diff-header-left">
            <span className="wr-diff-label">{streaming ? 'Writing live' : 'Improved Version'}</span>
            {!streaming && (
              <button
                className={`wr-diff-toggle${showDiff ? ' active' : ''}`}
                onClick={() => setShowDiff(!showDiff)}
                aria-pressed={showDiff}
                aria-label={showDiff ? 'Show clean version' : 'Show word diff'}
              >
                <RefreshCcw size={11} />
                {showDiff ? 'Clean' : 'Diff'}
              </button>
            )}
          </div>
          <div className="wr-diff-actions">
            {onSaveTemplate && (
              <button className="wr-diff-expand-btn" onClick={onSaveTemplate}>
                <BookmarkPlus size={11} /> Save
              </button>
            )}
            {onShare && (
              <button className="wr-diff-expand-btn" onClick={onShare}>
                <Share2 size={11} /> Share
              </button>
            )}
            <button className={`wr-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
        </div>

        <div className="wr-improved-text">
          {showDiff && !streaming ? (
            <DiffHighlight before={before} after={after} onStateChange={setWorkingDraft} />
          ) : (
            <>
              <AnimatedAfterText text={renderAfterText} animate={!streaming && !showDiff} />
              {streaming && <span className="wr-cursor" />}
            </>
          )}
        </div>

        {/* Refinement Popover */}
        {selection && selection.rect && !streaming && (
          <div
            className="wr-refine-pop"
            style={{
              top: selection.rect.top - 50 + window.scrollY,
              left: selection.rect.left + (selection.rect.width / 2) - 130
            }}
          >
            <input
              className="wr-refine-input"
              placeholder="How should I change this?..."
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
            />
            <button
              className="wr-refine-submit"
              disabled={isRefining || !refinePrompt.trim()}
              onClick={handleRefine}
            >
              {isRefining ? '...' : 'Refine'}
            </button>
          </div>
        )}

        {streaming ? (
          <div className="wr-text-meta">
            <span>{afterStats.words} words</span>
            <span>~{afterStats.readSecs}s read</span>
          </div>
        ) : (
          <div className="wr-meta-bar">
            <span className="wr-meta-chip">
              📊 {afterStats.words} words
              {deltaStr && <span className={`wr-word-delta${wordDelta <= 0 ? ' good' : ' up'}`}> {deltaStr}</span>}
            </span>
            <span className="wr-meta-chip">⏱️ ~{afterStats.readSecs}s read</span>
            <div className="h-4 w-px bg-[var(--wr-border-soft)]" />
            <div className="wr-readability">
              <span>Readability:</span>
              <span className={`wr-readability-score ${beforeReadability.cls}`}>{beforeReadability.label} ({beforeReadability.score})</span>
              <span className="wr-readability-arrow" aria-hidden="true">
                <ArrowRight size={12} />
              </span>
              <span className={`wr-readability-score ${afterReadability.cls}${afterReadability.score > beforeReadability.score ? ' wr-readability-improved' : ''}`}>
                {afterReadability.score < beforeReadability.score && <span title="Readability decreased" aria-label="Readability decreased">⚠️ </span>}
                {afterReadability.label} ({afterReadability.score})
              </span>
            </div>
          </div>
        )}
        {englishVersion && outputLang && outputLang !== 'en' && !streaming && (
          <button className="wr-lang-toggle" onClick={() => setShowEnglish((prev) => !prev)}>
            {showEnglish ? 'Show translated version' : 'Show English version'}
          </button>
        )}
      </div>

      {!streaming && <ScoreCard scores={scores} prevScores={prevScores} />}

      {!streaming && extraction?.meeting_request?.found && (
        <MeetingCard meeting={extraction.meeting_request} />
      )}

      {!streaming && extraction?.action_items && extraction.action_items.length > 0 && (
        <ActionChecklist items={extraction.action_items} />
      )}

      {!streaming && (
        <div className="wr-followup">
          <div className="wr-followup-icon">Why: </div>
          <p className="wr-followup-text">{explanation}</p>
        </div>
      )}

      {!streaming && teaching && teaching.mistakes.length > 0 && (
        <details className="wr-teaching">
          <summary className="wr-teaching-summary">
            {teaching.mistakes.length === 1
              ? '1 thing to note'
              : `${teaching.mistakes.length} things to note`
            }
          </summary>
          {teaching.mistakes.map((mistake, i) => (
            <div
              key={`${mistake}-${i}`}
              className="wr-fix-item"
              style={{ '--i': i } as React.CSSProperties}
            >
              <div className="wr-fix-num">{i + 1}</div>
              <div className="wr-fix-body">
                <p className="wr-fix-mistake">{mistake}</p>
                {teaching.better_versions?.[i] && (
                  <p className="wr-fix-better">
                    <span className="wr-fix-better-lbl">Better:</span>
                    {`"${teaching.better_versions[i]}"`}
                  </p>
                )}
                {teaching.explanations?.[i] && (
                  <p className="wr-fix-why">{teaching.explanations[i]}</p>
                )}
              </div>
            </div>
          ))}
        </details>
      )}

      {!streaming && followUp && (
        <div className="wr-followup">
          <div className="wr-followup-icon">💡</div>
          <p className="wr-followup-text">{followUp}</p>
        </div>
      )}

      {!streaming && suggestionChips.length > 0 && (
        <div className="wr-suggestions">
          <div className="wr-suggestion-chips">
            {suggestionChips.map((chip, i) => (
              <button
                key={`${chip}-${i}`}
                type="button"
                className="wr-suggestion-chip"
                onClick={() => onSuggest?.(chip)}
                disabled={!onSuggest}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {!streaming && canCollectFeedback && chatId && (
        <div className="wr-feedback-bar">
          <span className="wr-fb-label">How was this result?</span>
          <button
            className={`wr-fb-btn ${feedbackState === 'up' ? 'active' : ''}`}
            onClick={() => handleFeedback('up')}
            aria-label="This result was helpful"
            aria-pressed={feedbackState === 'up'}
            disabled={feedbackState !== 'none'}
          >
            <ThumbsUp size={12} strokeWidth={feedbackState === 'up' ? 3 : 2} />
          </button>
          <button
            className={`wr-fb-btn ${feedbackState === 'down' ? 'active' : ''}`}
            onClick={() => handleFeedback('down')}
            aria-label="This result needs improvement"
            aria-pressed={feedbackState === 'down'}
            disabled={feedbackState !== 'none'}
          >
            <ThumbsDown size={12} strokeWidth={feedbackState === 'down' ? 3 : 2} />
          </button>
        </div>
      )}
    </div>
  )
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="wr-inline-error">
      <span>⚠️ {message}</span>
      <button className="wr-retry-btn" onClick={onRetry}>
        <RefreshCcw size={11} /> Retry
      </button>
    </div>
  )
}

function SaveTemplateModal({
  open,
  defaultName,
  onClose,
  onSave,
}: {
  open: boolean
  defaultName: string
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)

  if (!open) return null

  return (
    <div className="wr-overlay" onClick={onClose}>
      <div className="wr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="wr-modal-title">Save As Template</h3>
        <input
          className="wr-search-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Template name"
          autoFocus
        />
        <div className="wr-modal-footer">
          <button className="wr-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            className="wr-modal-confirm"
            onClick={() => onSave(name.trim() || defaultName)}
          >
            Save Template
          </button>
        </div>
      </div>
    </div>
  )
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`
  }
  return lines
}

function BrandVoiceModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [examples, setExamples] = useState<VoiceExample[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setBusy] = useState(false)
  const [newContent, setNewContent] = useState('')
  const { showError } = useErrorToast()

  const loadExamples = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/writeright/voice')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setExamples(data.examples || [])
    } catch {
      showError('Failed to load style examples.')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    if (open) loadExamples()
  }, [open, loadExamples])

  const handleAdd = async () => {
    if (newContent.length < 20) {
      showError('Example is too short. Please provide at least 20 characters.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/writeright/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      })
      if (!res.ok) throw new Error()
      setNewContent('')
      loadExamples()
    } catch {
      showError('Failed to save example.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/writeright/voice/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      loadExamples()
    } catch {
      showError('Failed to delete example.')
    }
  }

  if (!open) return null

  return (
    <div className="wr-overlay" onClick={onClose}>
      <div className="wr-modal wr-voice-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="wr-modal-header">
          <div className="wr-modal-header-icon"><Fingerprint size={20} /></div>
          <div>
            <h3 className="wr-modal-title">Brand Voice DNA</h3>
            <p className="wr-modal-subtitle">Train the AI with your personal writing style.</p>
          </div>
          <button className="wr-modal-close" onClick={onClose} aria-label="Close modal"><X size={20} /></button>
        </div>

        <div className="wr-voice-input-section">
          <textarea
            className="wr-voice-textarea"
            placeholder="Paste your best-written email or a piece of text that perfectly captures your professional voice..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            maxLength={2000}
          />
          <div className="wr-voice-input-footer">
            <span className="wr-charcount">{newContent.length} / 2000</span>
            <button
              className="wr-modal-confirm"
              onClick={handleAdd}
              disabled={saving || newContent.length < 20}
            >
              {saving ? <Loader2 className="wr-spin" size={14} /> : 'Add to DNA'}
            </button>
          </div>
        </div>

        <div className="wr-voice-list">
          <h4 className="wr-voice-list-title">Active Style Examples ({examples.length})</h4>
          {loading ? (
            <div className="wr-voice-loading"><Loader2 className="wr-spin" /></div>
          ) : examples.length === 0 ? (
            <div className="wr-voice-empty">No examples added yet. Your AI will use a standard professional voice.</div>
          ) : (
            <div className="wr-voice-scroll">
              {examples.map((ex) => (
                <div key={ex.id} className="wr-voice-item">
                  <div className="wr-voice-item-content">{ex.content}</div>
                  <button className="wr-voice-delete" onClick={() => handleDelete(ex.id)} aria-label="Delete example">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShareModal({
  open,
  payload,
  onClose,
}: {
  open: boolean
  payload: SharePayload | null
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const drawCard = useCallback(() => {
    if (!open || !payload || !canvasRef.current) return
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = 1080 * dpr
    canvas.height = 1080 * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    canvas.style.width = '100%'
    canvas.style.height = 'auto'

    const styles = window.getComputedStyle(document.documentElement)
    const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback

    ctx.fillStyle = token('--bg-subtle', 'rgb(245 240 248)')
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = token('--surface', 'white')
    ctx.fillRect(72, 72, 936, 936)

    ctx.fillStyle = token('--mod-write', 'rgb(79 47 87)')
    ctx.font = '700 42px "Instrument Serif", Georgia, serif'
    ctx.fillText('BrainMate AI • WriteRight', 112, 150)

    ctx.fillStyle = token('--text-2', 'rgb(80 80 80)')
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(`Mode: ${payload.mode}   Tone: ${payload.tone}`, 112, 190)

    ctx.fillStyle = token('--bg-warm', 'rgb(255 236 234)')
    ctx.fillRect(112, 240, 856, 250)
    ctx.fillStyle = token('--error', 'rgb(176 64 51)')
    ctx.font = '700 20px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('BEFORE', 136, 274)

    ctx.fillStyle = token('--text-2', 'rgb(90 61 58)')
    ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif'
    const beforeLines = wrapCanvasText(ctx, payload.before, 800, 3)
    beforeLines.forEach((line, idx) => {
      ctx.fillText(line, 136, 320 + idx * 42)
    })

    ctx.fillStyle = token('--accent-subtle', 'rgb(233 248 239)')
    ctx.fillRect(112, 530, 856, 250)
    ctx.fillStyle = token('--success', 'rgb(31 122 79)')
    ctx.font = '700 20px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('AFTER', 136, 564)

    ctx.fillStyle = token('--text-1', 'rgb(47 79 64)')
    ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif'
    const afterLines = wrapCanvasText(ctx, payload.after, 800, 3)
    afterLines.forEach((line, idx) => {
      ctx.fillText(line, 136, 610 + idx * 42)
    })

    ctx.fillStyle = token('--mod-write', 'rgb(122 79 125)')
    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Try WriteRight free at brainmateai.com', 112, 900)
  }, [open, payload])

  useEffect(() => {
    drawCard()
  }, [drawCard])

  const downloadPng = useCallback(() => {
    if (!canvasRef.current) return
    canvasRef.current.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'writeright-share-card.png'
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [])

  const copyImage = useCallback(async () => {
    if (!canvasRef.current) return
    if (!navigator.clipboard || !(window as unknown as { ClipboardItem?: unknown }).ClipboardItem) return
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return
      const clipboardWindow = window as unknown as {
        ClipboardItem: new (items: Record<string, Blob>) => ClipboardItem
      }
      const item = new clipboardWindow.ClipboardItem({ 'image/png': blob })
      await navigator.clipboard.write([item])
    })
  }, [])

  const createShareLink = useCallback(async () => {
    if (!payload) return
    setBusy(true)
    try {
      const res = await apiPost<ShareResponse>('/api/writeright/share', {
        chatId: payload.chatId,
        jobId: payload.jobId,
      })
      setShareUrl(res.shareUrl)
    } catch {
      setShareUrl(null)
    } finally {
      setBusy(false)
    }
  }, [payload])

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // no-op
    }
  }, [shareUrl])

  useEffect(() => {
    if (open) setShareUrl(null)
  }, [open])

  if (!open || !payload) return null

  return (
    <div className="wr-overlay" onClick={onClose}>
      <div className="wr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="wr-modal-title">Share Card</h3>
        <div className="wr-share-canvas-wrap">
          <canvas ref={canvasRef} className="wr-share-canvas" />
        </div>
        {shareUrl && (
          <div className="wr-followup wr-share-link-box">
            <div className="wr-followup-icon">🔗</div>
            <p className="wr-followup-text wr-share-link-text">{shareUrl}</p>
          </div>
        )}
        <div className="wr-modal-footer">
          <button className="wr-modal-cancel" onClick={onClose}>Close</button>
          <button className="wr-modal-cancel" onClick={downloadPng}>Download PNG</button>
          <button className="wr-modal-cancel" onClick={() => void copyImage()}>Copy Image</button>
          <button className="wr-modal-confirm" onClick={() => void createShareLink()} disabled={busy}>
            {busy ? 'Creating...' : 'Create Link'}
          </button>
          {shareUrl && (
            <button className="wr-modal-confirm" onClick={() => void copyShareLink()}>
              Copy Link
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  const groups = [
    {
      label: 'Compose',
      items: [
        { desc: 'Submit message', keys: ['Ctrl', 'Enter'] },
        { desc: 'Cancel current request', keys: ['Escape'] },
        { desc: 'Focus input', keys: ['Ctrl', 'K'] },
        { desc: 'Cycle tone', keys: ['T'] },
      ],
    },
    {
      label: 'Navigation',
      items: [
        { desc: 'Switch modes', keys: ['1-4'] },
        { desc: 'New chat', keys: ['N'] },
        { desc: 'Back to landing', keys: ['Backspace'] },
      ],
    },
    {
      label: 'Actions',
      items: [
        { desc: 'Save last output as template', keys: ['Ctrl', 'S'] },
        { desc: 'Copy last improved text', keys: ['Ctrl', 'Shift', 'C'] },
        { desc: 'Open shortcuts', keys: ['Ctrl', '/'] },
        { desc: 'Open shortcuts (?)', keys: ['?'] },
      ],
    },
  ] as const

  return (
    <div className="wr-overlay" onClick={onClose}>
      <div
        className="wr-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <h3 className="wr-modal-title">Keyboard Shortcuts</h3>
        {groups.map((group) => (
          <div key={group.label} className="wr-shortcut-section">
            <p className="wr-shortcut-section-lbl">{group.label}</p>
            {group.items.map((item) => (
              <div key={`${group.label}-${item.desc}`} className="wr-shortcut-row">
                <span className="wr-shortcut-desc">{item.desc}</span>
                <div className="wr-shortcut-keys">
                  {item.keys.map((keyPart) => (
                    <kbd key={`${item.desc}-${keyPart}`} className="wr-kbd">{keyPart}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="wr-modal-footer">
          <button className="wr-modal-confirm" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function StatsPanel({
  open,
  loading,
  stats,
  writingProfile,
  onToggle,
}: {
  open: boolean
  loading: boolean
  stats: WriterightStats | null
  writingProfile?: { top_mistakes: string[], improvement_count: number } | null
  onToggle: () => void
}) {
  const topMode = stats?.mode_breakdown[0]
  const topTone = stats?.tone_breakdown[0]
  const maxWeek = Math.max(1, ...(stats?.weekly_counts ?? [1]))

  return (
    <div className="wr-stats-panel">
      <button className="wr-stats-toggle" onClick={onToggle}>
        <span className="wr-stats-toggle-label"><BarChart3 size={12} /> Stats</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="wr-stats-body">
          {loading && <p className="wr-stat-lbl">Loading stats…</p>}
          {!loading && stats && (
            <>
              <div className="wr-stats-grid">
                <div className="wr-stat-tile">
                  <div className="wr-stat-num">{stats.streak.current}</div>
                  <div className="wr-stat-lbl">🔥 Days streak</div>
                </div>
                <div className="wr-stat-tile">
                  <div className="wr-stat-num">{stats.total}</div>
                  <div className="wr-stat-lbl">📝 Improvements</div>
                </div>
                <div className="wr-stat-tile">
                  <div className="wr-stat-num">{topMode ? `${topMode.mode}` : '—'}</div>
                  <div className="wr-stat-lbl">Favourite mode {topMode ? `(${topMode.percent}%)` : ''}</div>
                </div>
                <div className="wr-stat-tile">
                  <div className="wr-stat-num">{topTone ? `${topTone.tone}` : '—'}</div>
                  <div className="wr-stat-lbl">Top tone {topTone ? `(${topTone.percent}%)` : ''}</div>
                </div>
              </div>
              <div className="wr-sparkline">
                {(stats.weekly_counts ?? []).map((count, idx) => {
                  const barH = `${Math.max(3, Math.round((count / maxWeek) * 28))}px`
                  return (
                    <div
                      key={`spark-${idx}`}
                      className="wr-bar"
                      title={`${count} improvements`}
                      style={{ height: barH, '--i': idx, '--bar-h': barH } as React.CSSProperties}
                    />
                  )
                })}
              </div>
              <div className="wr-achievements-row">
                {stats.achievements.map((achievement) => {
                  const meta = ACHIEVEMENT_META[achievement] ?? { emoji: '⭐', label: achievement }
                  return (
                    <div key={achievement} className="wr-achievement-badge">
                      {meta.emoji}
                      <div className="wr-achievement-tooltip">{meta.label}</div>
                    </div>
                  )
                })}
              </div>
              {writingProfile && writingProfile.top_mistakes.length > 0 && (
                <div className="wr-profile-block">
                  <div className="wr-section-header">Your writing patterns</div>
                  <div className="wr-profile-tags">
                    {writingProfile.top_mistakes.map(m => (
                      <span key={m} className="wr-profile-tag">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {stats.avg_clarity_by_day && stats.avg_clarity_by_day.some(v => v > 0) && (
                <div>
                  <div className="wr-section-header">
                    Writing clarity trend
                  </div>
                  <div className="wr-sparkline">
                    {stats.avg_clarity_by_day.map((score, idx) => {
                      const h = score > 0 ? `${Math.round((score / 10) * 28)}px` : '3px'
                      const color = score >= 8 ? 'var(--wr-success)' : score >= 5 ? 'var(--wr-warning)' : 'var(--wr-bg)'
                      return (
                        <div
                          key={idx}
                          className="wr-bar"
                          style={{ height: h, background: color, '--i': idx } as React.CSSProperties}
                          title={score > 0 ? `Day ${idx + 1}: ${score}/10 clarity` : 'No data'}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

function computeWordDiff(before: string, after: string): Array<{ type: 'eq' | 'del' | 'ins', text: string }> {
  // Guard: skip diff for large inputs to prevent UI freeze
  if (before.length > 2000 || after.length > 2000) {
    return [{ type: 'ins', text: after }]
  }

  const bTokens = before.split(/(\s+)/);
  const aTokens = after.split(/(\s+)/);

  const m = bTokens.length;
  const n = aTokens.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (bTokens[i - 1] === aTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: Array<{ type: 'eq' | 'del' | 'ins', text: string }> = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && bTokens[i - 1] === aTokens[j - 1]) {
      result.push({ type: 'eq', text: bTokens[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'ins', text: aTokens[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.push({ type: 'del', text: bTokens[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

function DiffHighlight({
  before,
  after,
  onStateChange
}: {
  before: string;
  after: string;
  onStateChange?: (finalText: string) => void;
}) {
  const diffs = useMemo(
    () => (before.length <= 2000 && after.length <= 2000)
      ? computeWordDiff(before, after)
      : [{ type: 'ins' as const, text: after }],
    [before, after]
  );

  // track which diff segments are rejected (true = rejected, false/undefined = accepted)
  const [decisions, setDecisions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!onStateChange) return;
    const finalText = diffs.map((d, i) => {
      const isRejected = decisions[i];
      if (d.type === 'eq') return d.text;
      if (d.type === 'del') return isRejected ? d.text : ''; // if rejected, keep original
      if (d.type === 'ins') return isRejected ? '' : d.text; // if rejected, remove AI suggestion
      return '';
    }).join('');
    onStateChange(finalText);
  }, [decisions, diffs, onStateChange]);

  const toggleDecision = (i: number) => {
    setDecisions(prev => ({ ...prev, [i]: !prev[i] }));
  };

  return (
    <>
      {diffs.map((d, i) => {
        const isRejected = decisions[i];
        if (d.type === 'eq') return <span key={i}>{d.text}</span>;
        if (d.type === 'del') return (
          <span
            key={i}
            className={`wr-diff-del ${isRejected ? 'rejected' : 'accepted'}`}
            onClick={() => toggleDecision(i)}
            title={isRejected ? "Click to remove this part" : "Click to restore original"}
          >
            {d.text}
          </span>
        );
        if (d.type === 'ins') return (
          <span
            key={i}
            className={`wr-diff-ins ${isRejected ? 'rejected' : 'accepted'}`}
            onClick={() => toggleDecision(i)}
            title={isRejected ? "Click to accept suggestion" : "Click to reject suggestion"}
          >
            {d.text}
          </span>
        );
        return null;
      })}
    </>
  );
}


const TONE_HEURISTICS: Record<string, (t: string) => string> = {
  Concise: (t) => t.replace(/\b(just|simply|basically|actually|very|really)\b/gi, '').replace(/\s{2,}/g, ' ').trim(),
  Professional: (t) => t.replace(/\bkindly\b/gi, 'please').replace(/\bdo the needful\b/gi, 'complete this').trim(),
  Assertive: (t) => t.replace(/\bI think\b/gi, 'I').replace(/\bmaybe\b/gi, '').replace(/\bpossibly\b/gi, '').replace(/\s{2,}/g, ' ').trim(),
  Friendly: (t) => t + (t.endsWith('.') ? ' Hope this helps!' : ''),
  Academic: (t) => t.replace(/\buse\b/gi, 'utilize').replace(/\bshow\b/gi, 'demonstrate').trim(),
}

function TonePreviewTooltip({ text, tone }: { text: string; tone: string }) {
  if (text.length < 80) return null;
  const fn = TONE_HEURISTICS[tone];
  if (!fn) return null;

  let preview = fn(text);
  if (preview === text) return null;
  if (preview.length > 100) preview = preview.slice(0, 100) + '...';

  return (
    <div className="wr-tone-preview">
      <div className="wr-tone-preview-label">Live Preview</div>
      <div>{preview}</div>
    </div>
  )
}

// Module-level constant — stable identity, no useMemo needed
const DAILY_CHALLENGES = [
  { title: 'Write a persuasive email', desc: 'Try convincing your team to adopt a new tool.' },
  { title: 'Draft a friendly follow-up', desc: 'Follow up cleanly without sounding pushy.' },
  { title: 'Explain a complex feature', desc: 'Explain something technical to a non-technical person.' },
  { title: 'Request a deadline extension', desc: 'Politely ask for more time on a project.' },
  { title: 'Send a cold outreach', desc: 'Write a warm opening for a potential new client.' },
] as const

// ── NEW: [LOOP-1] Confetti burst helper ──
function spawnConfetti(target: HTMLElement) {
  const rect = target.getBoundingClientRect()
  const container = document.createElement('div')
  container.className = 'wr-confetti'
  container.style.left = `${rect.left + rect.width / 2}px`
  container.style.top = `${rect.top}px`
  container.style.position = 'fixed'
  for (let i = 0; i < 6; i++) {
    const p = document.createElement('div')
    p.className = 'wr-confetti-particle'
    p.style.left = `${(Math.random() - 0.5) * 40}px`
    p.style.animationDelay = `${Math.random() * 100}ms`
    p.style.animationDuration = `${400 + Math.random() * 200}ms`
    container.appendChild(p)
  }
  document.body.appendChild(container)
  setTimeout(() => container.remove(), 800)
}

const MILESTONES: Record<number, string> = { 5: '🏆 5 texts improved! You\u2019re warming up.', 10: '⚡ 10x writer! Building momentum.', 25: '🔥 25 improvements — you\u2019re on fire!', 50: '👑 50 texts! Writing mastery unlocked.' }

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

export default function WriteRightPage() {
  const router = useRouter()
  const { getToken } = useAuth()
  const { toasts, dismiss, showError } = useErrorToast()
  const [input, setInput] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Persist sidebar state
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('wr:sidebarOpen')
    if (saved !== null) setIsSidebarOpen(saved === 'true')
  }, [])

  useEffect(() => {
    localStorage.setItem('wr:sidebarOpen', isSidebarOpen.toString())
  }, [isSidebarOpen])
  const [tone, setTone] = useState<ToneOption>('Professional')
  const [intensity, setIntensity] = useState(3)
  const debouncedIntensity = useDebounce(intensity, 600)
  const debouncedTone = useDebounce(tone, 600)
  const [isMorphing, setIsMorphing] = useState(false)
  const [mode, setMode] = useState<WritingMode>('email')
  const [outputLang, setOutputLang] = useState<OutputLang>('en')
  const [isTriageMode, setIsTriageMode] = useState(false)
  const [triageItems, setTriageItems] = useState<TriageItem[]>([])
  const [triageLoading, setTriageLoading] = useState(false)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [showAdvancedTools, setShowAdvancedTools] = useState(false)
  const [showSelectors, setShowSelectors] = useState(false)

  const { playClick, playShimmer, toggleMute, isMuted } = useHaptics()

  // ── CLARITY SCORE (Real-time Flow Feedback) ──
  const clarityScore = useMemo(() => {
    if (!input.trim()) return 0
    const text = input.trim()
    const words = text.split(/\s+/).filter(Boolean)
    const wordCount = words.length
    const sentenceCount = text.split(/[.!?]+/).filter(Boolean).length || 1
    const complexWordCount = words.filter(w => w.length > 8).length

    const avgWordsPerSentence = wordCount / sentenceCount
    const complexRatio = complexWordCount / wordCount

    // Penalty for long sentences (> 18 words)
    const lengthPenalty = Math.max(0, (avgWordsPerSentence - 15) * 3)
    // Penalty for density of long "complex" words
    const complexityPenalty = complexRatio * 60

    const score = 100 - lengthPenalty - complexityPenalty
    return Math.max(5, Math.min(100, Math.round(score)))
  }, [input])

  const prevScoreRef = useRef(clarityScore)
  const [pulse, setPulse] = useState(false)
  const [ghostText, setGhostText] = useState('')
  const [ghosting, setGhosting] = useState(false)

  useEffect(() => {
    if (clarityScore > prevScoreRef.current + 2) { // Only pulse on noticeable improvement
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 500)
      prevScoreRef.current = clarityScore
      return () => clearTimeout(timer)
    }
    prevScoreRef.current = clarityScore
  }, [clarityScore])

  // Get color based on score
  const clarityColor = useMemo(() => {
    if (clarityScore < 40) return '#f59e0b' // Amber
    if (clarityScore < 70) return '#06b6d4' // Cyan
    return '#10b981' // Emerald
  }, [clarityScore])

  // ── GHOSTING EFFECT (Tactile Feedback on Morph) ──
  useEffect(() => {
    if (!input.trim() || isMorphing || loading) return

    setGhosting(true)

    // Choose base for ghosting: Improved text if exists, else input
    const lastAiMsg = messages[messages.length - 1]
    const baseText = (lastAiMsg?.role === 'ai' && lastAiMsg.kind === 'result')
      ? lastAiMsg.jobResult.improved_text
      : input

    const words = baseText.slice(0, 500).split(' ')
    const mockGhost = words.map((w, i) => {
      // Visual "morphing" pattern
      if (i % 8 === 0 && w.length > 2) return '●'.repeat(Math.min(w.length, 6))
      return w
    }).join(' ')

    setGhostText(mockGhost + (baseText.length > 500 ? '...' : ''))

    const timer = setTimeout(() => {
      setGhosting(false)
      setGhostText('')
    }, 450)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensity, tone])

  const [messages, setMessages] = useState<WriteRightMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [lastSubmittedText, setLastSubmittedText] = useState<string | null>(null)
  const [lastImprovedText, setLastImprovedText] = useState('')
  const [lastResultMeta, setLastResultMeta] = useState<{ mode: WritingMode; tone: ToneOption; chatId: string; jobId: string } | null>(null)
  const [resultAnnouncement, setResultAnnouncement] = useState('')

  const handleMorph = useCallback(async (
    lastMsg: Extract<WriteRightMessage, { kind: 'result' }>,
    newTone: ToneOption,
    newIntensity: number
  ) => {
    setIsMorphing(true)
    const originalText = lastMsg.before
    const currentText = lastMsg.jobResult.improved_text

    try {
      const response = await fetch('/api/writeright/morph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          original_text: originalText,
          current_text: currentText,
          tone: newTone,
          intensity: newIntensity,
          mode,
        }),
      })

      if (!response.ok) throw new Error('Morph failed')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      let morphedText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = new TextDecoder().decode(value)
        morphedText += chunk

        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'ai' && last.kind === 'result') {
            last.jobResult = { ...last.jobResult, improved_text: morphedText }
            last.tone = newTone
            last.intensity = newIntensity
          }
          return next
        })
      }
    } catch (err) {
      console.error('[WriteRight] Morphing error:', err)
    } finally {
      setIsMorphing(false)
    }
  }, [chatId, mode])

  const handleTriage = useCallback(async () => {
    if (!input.trim() || triageLoading) return
    setTriageLoading(true)
    try {
      const res = await fetch('/api/writeright/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: input, chatId }),
      })
      if (!res.ok) throw new Error('Triage failed')
      const data: TriageResponse = await res.json()
      setTriageItems(data.items)
    } catch (err) {
      console.error('[WriteRight] Triage error:', err)
      showError('Failed to triage messages. Please try again.')
    } finally {
      setTriageLoading(false)
    }
  }, [input, chatId, triageLoading, showError])

  // ── MORPHING EFFECT ──
  useEffect(() => {
    if (!chatId || messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'ai' || lastMsg.kind !== 'result') return

    // Don't morph if settings match the last generation or if we're currently loading/morphing
    if (lastMsg.intensity === debouncedIntensity && lastMsg.tone === debouncedTone) return
    if (loading || isMorphing) return

    void handleMorph(lastMsg, debouncedTone, debouncedIntensity)
  }, [debouncedIntensity, debouncedTone, chatId, loading, isMorphing, messages, handleMorph])

  const [chats, setChats] = useState<ChatListItem[]>([])

  const [writingProfile, setWritingProfile] = useState<{ top_mistakes: string[], improvement_count: number } | null>(null)
  const [draftSaveWarning, setDraftSaveWarning] = useState<string | null>(null)


  // Draft Auto-save
  useEffect(() => {
    if (chatId && input) {
      const t = setTimeout(() => {
        try {
          if (JSON.stringify(input).length >= 50_000) {
            setDraftSaveWarning('Draft too large to auto-save locally.')
            return
          }
          localStorage.setItem(`wr:draft:${chatId}`, input)
          setDraftSaveWarning(null)
        } catch {
          setDraftSaveWarning('Draft could not be auto-saved locally.')
        }
      }, 2000)
      return () => clearTimeout(t)
    }
    setDraftSaveWarning(null)
  }, [input, chatId])
  useEffect(() => {
    if (chatId) {
      const saved = localStorage.getItem(`wr:draft:${chatId}`)
      if (saved && !input) setInput(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  // F-08: Chip counts
  const [chipCounts, setChipCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wr:chipCounts')
      if (stored) setChipCounts(JSON.parse(stored))
    } catch { }
  }, [])


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault(); void submitRef.current();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault(); if (lastImprovedText) navigator.clipboard.writeText(lastImprovedText);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); document.querySelector<HTMLInputElement>('.wr-search-field')?.focus();
      } else if (e.key === 'Escape') {
        // e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lastImprovedText]);

  // F-10: Daily Challenge — uses module-level DAILY_CHALLENGES constant
  const todayChallenge = DAILY_CHALLENGES[Math.floor(Date.now() / 86400000) % DAILY_CHALLENGES.length]

  // BUG-05: Daily challenge dismiss + completion state
  const todayKey = Math.floor(Date.now() / 86400000).toString()
  const [challengeDone, setChallengeDone] = useState(false)
  const [challengeDismissed, setChallengeDismissed] = useState(false)

  useEffect(() => {
    try {
      setChallengeDone(localStorage.getItem('wr:c:' + todayKey) === '1')
      setChallengeDismissed(localStorage.getItem('wr:cd:' + todayKey) === '1')
    } catch {
      setChallengeDone(false)
      setChallengeDismissed(false)
    }
  }, [todayKey])

  // ENHANCE-04: Writing momentum indicator
  const [sessionCount, setSessionCount] = useState(0)

  // ENHANCE-06: Keyboard shortcut discovery toast
  const [showShortcutTip, setShowShortcutTip] = useState(false)

  // GAME-1: Achievement milestone banner
  const [achievementBanner, setAchievementBanner] = useState<string | null>(null)
  useEffect(() => {
    if (sessionCount > 0 && MILESTONES[sessionCount]) {
      setAchievementBanner(MILESTONES[sessionCount])
      const t = setTimeout(() => setAchievementBanner(null), 5000)
      return () => clearTimeout(t)
    }
  }, [sessionCount])

  // F-11: Writing brief
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderObj, setBuilderObj] = useState({ audience: '', purpose: '', points: '' })





  const [searchQuery, setSearchQuery] = useState('')
  const { loading: searchLoading, results: searchResults } = useWriterightSearch(searchQuery, true)

  const [statsOpen, setStatsOpen] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [stats, setStats] = useState<WriterightStats | null>(null)

  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [rantDismissed, setRantDismissed] = useState(false)
  const [voiceLang, setVoiceLang] = useState<VoiceLang>('en-IN')

  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveTemplatePrefill, setSaveTemplatePrefill] = useState('')
  const [saveTemplatePayload, setSaveTemplatePayload] = useState<{ content: string; mode: WritingMode; tone: ToneOption } | null>(null)

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)

  const [streamingText, setStreamingText] = useState('')
  const [streamingBefore, setStreamingBefore] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  
  // ── Gmail Integration (isolated state) ──
  const gmail = useGmailIntegration()

  const [isFocusMode, setIsFocusMode] = useState(false)
  const [isSplitView, setIsSplitView] = useState(false)
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState<number | null>(null)
  const [showGrammar, setShowGrammar] = useState(false)
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([])
  const [emailChainOpen, setEmailChainOpen] = useState(false)
  const [isChainMode, setIsChainMode] = useState(false)
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [coachMetrics, setCoachMetrics] = useState<CoachMetrics | null>(null)
  const [splitSelection, setSplitSelection] = useState<{ text: string; rect: DOMRect | null } | null>(null)
  const [splitRefinePrompt, setSplitRefinePrompt] = useState('')
  const [isSplitRefining, setIsSplitRefining] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  const [activeFilter, setActiveFilter] = useState<'INBOX' | 'SENT' | 'DRAFT' | 'SCHEDULED'>('INBOX')
  const handleActiveFilterChange = useCallback((filter: 'INBOX' | 'SENT' | 'DRAFT' | 'SCHEDULED') => {
    setActiveFilter(filter)
    if (filter !== 'SCHEDULED') {
      gmail.setFilter(filter)
    }
  }, [gmail])

  const { preferences, updatePreference, loading: prefsLoading } = useWritingPreferences()
  const isFirstMount = useRef(true)

  useEffect(() => {
    if (!prefsLoading && preferences && isFirstMount.current) {
      isFirstMount.current = false
      setTone(preferences.preferredTone)
      setMode(preferences.preferredMode)
      setIntensity(preferences.preferredIntensity)
      setOutputLang(preferences.preferredOutputLang)
      setIsSidebarOpen(preferences.uiPreferences.sidebarOpen)
      const uiPrefs = preferences.uiPreferences as Record<string, unknown>
      setIsFocusMode(uiPrefs.focusModeEnabled === true || preferences.uiPreferences.analyticsOpen)
    }
  }, [preferences, prefsLoading])

  useEffect(() => {
    if (prefsLoading || isFirstMount.current) return
    if (preferences.preferredTone !== tone) {
      updatePreference('preferredTone', tone)
    }
  }, [tone, prefsLoading, updatePreference, preferences.preferredTone])

  useEffect(() => {
    if (prefsLoading || isFirstMount.current) return
    if (preferences.preferredMode !== mode) {
      updatePreference('preferredMode', mode)
    }
  }, [mode, prefsLoading, updatePreference, preferences.preferredMode])

  useEffect(() => {
    if (prefsLoading || isFirstMount.current) return
    if (preferences.preferredIntensity !== intensity) {
      updatePreference('preferredIntensity', intensity)
    }
  }, [intensity, prefsLoading, updatePreference, preferences.preferredIntensity])

  useEffect(() => {
    if (prefsLoading || isFirstMount.current) return
    if (preferences.preferredOutputLang !== outputLang) {
      updatePreference('preferredOutputLang', outputLang)
    }
  }, [outputLang, prefsLoading, updatePreference, preferences.preferredOutputLang])

  useEffect(() => {
    if (prefsLoading || isFirstMount.current) return
    if (preferences.uiPreferences?.sidebarOpen !== isSidebarOpen) {
      updatePreference('uiPreferences', {
        ...preferences.uiPreferences,
        sidebarOpen: isSidebarOpen
      })
    }
  }, [isSidebarOpen, prefsLoading, updatePreference, preferences.uiPreferences])

  useEffect(() => {
    if (prefsLoading || isFirstMount.current) return
    const uiPrefs = preferences.uiPreferences as Record<string, unknown>
    if (uiPrefs?.analyticsOpen !== isFocusMode && uiPrefs?.focusModeEnabled !== isFocusMode) {
      updatePreference('uiPreferences', {
        ...preferences.uiPreferences,
        analyticsOpen: isFocusMode
      } as unknown as typeof preferences.uiPreferences)
    }
  }, [isFocusMode, prefsLoading, updatePreference, preferences.uiPreferences])

  useEffect(() => {
    if (input.trim().length >= 21 && isFocused) {
      const timer = setTimeout(() => {
        setCoachMetrics(analyzeText(input))
      }, 400)
      return () => clearTimeout(timer)
    } else {
      setCoachMetrics(null)
    }
  }, [input, isFocused])

  const handleSelectSentence = (sentence: string, index: number, rect: DOMRect | null) => {
    setSelectedSentenceIndex(index)
    setSplitSelection({ text: sentence, rect })
  }

  const handleSplitRefine = async () => {
    if (!splitSelection || !splitRefinePrompt.trim() || isSplitRefining) return
    setIsSplitRefining(true)
    try {
      const res = await fetch('/api/writeright/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullText: lastImprovedText,
          selectedText: splitSelection.text,
          prompt: splitRefinePrompt,
          mode,
          tone
        })
      })
      if (!res.ok) throw new Error('Refine failed')
      const data = await res.json()
      setLastImprovedText(prev => prev.replace(splitSelection.text, data.refinedText))
      setSplitSelection(null)
      setSelectedSentenceIndex(null)
      setSplitRefinePrompt('')
    } catch (err) {
      console.error(err)
    } finally {
      setIsSplitRefining(false)
    }
  }

  const [fileBadge, setFileBadge] = useState<{ name: string; loading: boolean } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadingStartRef = useRef<number | null>(null)
  const submitRef = useRef<(text?: string, forcedTone?: ToneOption) => Promise<void>>(async () => { })
  const pendingSubmissionRef = useRef<{ signature: string; key: string } | null>(null)

  const handleGmailImport = useCallback((email: GmailEmailItem, action: 'improve' | 'summarize' | 'rewrite' | 'change_tone' | 'shorten' | 'professionalize' | 'reply') => {
    const text = gmail.buildImportText(email, action)
    setInput(text.slice(0, CHAR_MAX))
    if (taRef.current) {
      taRef.current.focus()
      taRef.current.style.height = 'auto'
      taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 320)}px`
    }
  }, [gmail, setInput])

  const {
    templates,
    loadTemplates,
    createTemplate,
    renameTemplate,
    deleteTemplate,
    markUsed,
  } = useTemplates()

  const charLen = input.length
  const charClass = charLen >= CHAR_LIMIT ? 'danger' : charLen >= CHAR_WARN ? 'warn' : ''
  const charDisplay = charLen > 0 ? `${charLen.toLocaleString()} / ${CHAR_MAX.toLocaleString()}` : ''

  const isRanting = useRantDetector(input)
  const hasInputText = input.trim().length > 0
  const shouldShowRantBanner = !rantDismissed && hasInputText && isRanting

  const {
    supported: voiceSupported,
    isRecording,
    toggleRecording,
    stopRecording,
  } = useVoiceInput({
    input,
    setInput,
    voiceLang,
  })

  const loadChats = useCallback(async () => {
    try {
      const res = await apiGet<ListChatsResponse>('/api/writeright/chat?page=0&limit=20')
      setChats(res.chats || [])
    } catch (err) {
      console.error('Failed to load chats', err)
    }
  }, [])

  const loadStats = useCallback(async () => {
    if (stats || statsLoading) return
    setStatsLoading(true)
    try {
      const res = await apiGet<WriterightStats>('/api/writeright/stats')
      setStats(res)
    } catch (err) {
      console.error('Failed to load stats', err)
    } finally {
      setStatsLoading(false)
    }
  }, [stats, statsLoading])

  const loadProfile = useCallback(async () => {
    try {
      const res = await apiGet<{ top_mistakes: string[], improvement_count: number }>('/api/writeright/profile')
      setWritingProfile(res)
    } catch {
      // Non-fatal
    }
  }, [])

  useEffect(() => {
    loadChats()
    loadTemplates().catch(() => undefined)
    loadProfile()
  }, [loadChats, loadTemplates, loadProfile])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  useEffect(() => {
    if (statsOpen) {
      void loadStats()
    }
  }, [statsOpen, loadStats])

  useEffect(() => {
    if (!input.trim()) setFileError(null)
  }, [input])

  const scrollBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 60)
  }, [])

  const cycleVoiceLang = useCallback(() => {
    setVoiceLang((prev) => {
      const idx = VOICE_LANGS.findIndex((lang) => lang.id === prev)
      const next = idx >= 0 ? (idx + 1) % VOICE_LANGS.length : 0
      return VOICE_LANGS[next].id
    })
  }, [])

  const copyTextToClipboard = useCallback(async (text: string, targetEl?: HTMLElement) => {
    if (!text.trim()) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        // LOOP-1: Micro-celebration confetti on copy
        if (targetEl) spawnConfetti(targetEl)
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand('copy')
        if (targetEl) spawnConfetti(targetEl)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }, [])

  const openSaveTemplateModal = useCallback((content: string, itemMode: WritingMode, itemTone: ToneOption) => {
    const prefill = content.slice(0, 50).trim() || 'Untitled Template'
    setSaveTemplatePrefill(prefill)
    setSaveTemplatePayload({ content, mode: itemMode, tone: itemTone })
    setSaveModalOpen(true)
  }, [])

  const saveTemplateFromModal = useCallback(async (name: string) => {
    if (!saveTemplatePayload) return
    try {
      await createTemplate({
        name,
        content: saveTemplatePayload.content,
        mode: saveTemplatePayload.mode,
        tone: saveTemplatePayload.tone,
      })
      setSaveModalOpen(false)
    } catch (err) {
      console.error('Failed to save template', err)
      showError('Failed to save template. Please try again.')
    }
  }, [createTemplate, saveTemplatePayload, showError])

  const openShareModal = useCallback((payload: SharePayload) => {
    setSharePayload(payload)
    setShareModalOpen(true)
  }, [])

  const buildAiResultMessage = useCallback((opts: {
    id?: string
    before: string
    result: AIJobResult
    jobId?: string | null
    chatId?: string | null
    mode: WritingMode
    tone: ToneOption
    intensity: number
    outputLang: OutputLang
    prevScores?: AIQualityScores
  }): WriteRightMessage => {
    const { id, before, result, jobId, chatId: chatIdArg, mode: blockMode, tone: blockTone, intensity: blockIntensity, outputLang: blockOutputLang, prevScores: blockPrevScores } = opts
    return {
      id: id ?? makeClientId('ai'),
      role: 'ai',
      kind: 'result',
      before,
      jobResult: result,
      jobId,
      chatId: chatIdArg,
      mode: blockMode,
      tone: blockTone,
      intensity: blockIntensity,
      outputLang: blockOutputLang,
      prevScores: blockPrevScores,
      timestamp: Date.now(),
    }
  }, [])

  const handleModeChange = useCallback((newMode: WritingMode) => {
    if (newMode === mode) return
    const wasStarted = hasStarted || chatId !== null
    setMode(newMode)
    setRantDismissed(false)   // reset so rant banner can reappear in new mode
    if (wasStarted) {
      const modeLabel = MODES.find((m) => m.id === newMode)?.label ?? newMode
      setMessages((prev) => [...prev, {
        id: makeClientId('notice'),
        role: 'ai',
        kind: 'notice',
        content: `Switched to ${modeLabel} mode`,
      }])
    }
  }, [chatId, hasStarted, mode])

  const selectChat = useCallback(async (id: string, chatMode: string) => {
    try {
      setMode(chatMode as WritingMode)
      setChatId(id)
      const res = await apiGet<{ messages: ChatMessageRow[] }>(`/api/writeright/chat/${id}/messages`)
      let latestImproved = ''
      let latestMeta: { mode: WritingMode; tone: ToneOption; chatId: string; jobId: string } | null = null
      let lastBeforeText = ''

      const reconstructed: WriteRightMessage[] = res.messages.map((m) => {
        const metadata = (m.metadata ?? {}) as Record<string, unknown>
        if (m.role === 'user') {
          lastBeforeText = typeof metadata.original_text === 'string' ? metadata.original_text : m.content
          return {
            id: m.id,
            role: 'user',
            content: m.content,
            timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
          }
        }

        try {
          const parsed = JSON.parse(m.content) as AIJobResult
          latestImproved = typeof parsed.improved_text === 'string' ? parsed.improved_text : latestImproved
          const jobId = typeof metadata.job_id === 'string' ? metadata.job_id : null
          const savedMode = (typeof metadata.mode === 'string' ? metadata.mode : chatMode) as WritingMode
          const savedTone = (typeof metadata.tone === 'string' ? metadata.tone : tone) as ToneOption
          const savedOutputLang = (typeof metadata.output_language === 'string' ? metadata.output_language : 'en') as OutputLang
          const savedIntensity = (typeof metadata.intensity === 'number' ? metadata.intensity : 3)
          if (isUuidLike(jobId)) {
            latestMeta = { mode: savedMode, tone: savedTone, chatId: id, jobId }
          }
          const resultMessage = buildAiResultMessage({
            id: m.id,
            before: lastBeforeText || 'Previous draft',
            result: parsed,
            jobId,
            chatId: id,
            mode: savedMode,
            tone: savedTone,
            intensity: savedIntensity,
            outputLang: savedOutputLang,
          })
          resultMessage.timestamp = m.created_at ? new Date(m.created_at).getTime() : Date.now()
          return resultMessage
        } catch {
          return {
            id: m.id,
            role: 'ai',
            kind: 'notice',
            content: m.content,
            timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
          }
        }
      })

      setMessages(reconstructed)
      if (latestImproved) setLastImprovedText(latestImproved)
      setLastResultMeta(latestMeta)
      setHasStarted(true)
      setSearchQuery('')
      scrollBottom()
    } catch (err) {
      console.error('Failed to load chat messages', err)
    }
  }, [buildAiResultMessage, scrollBottom, tone])

  const deleteChat = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await apiDelete(`/api/writeright/chat/${id}`)
      setChats((prev) => prev.filter((c) => c.id !== id))
      if (chatId === id) {
        handleModeChange('email')
      }
    } catch (err) {
      console.error('Failed to delete chat', err)
    }
  }, [chatId, handleModeChange])

  const [isExporting, setIsExporting] = useState(false)

  // Safe helpers for export — prevent JSON.parse throws and XSS via innerHTML
  type ExportMsg = { role: string; content: string; timestamp: string }
  type ExportChat = { title: string; messages: ExportMsg[] }

  function safeExtractImproved(content: string): string {
    try {
      const p = JSON.parse(content) as { improved_text?: string }
      return p?.improved_text ?? content
    } catch {
      return content
    }
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const data = await apiGet<{ chats?: ExportChat[] }>('/api/writeright/export')

      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      document.body.appendChild(iframe)

      iframe.contentWindow?.document.open()
      iframe.contentWindow?.document.write(`
        <html><head><title>WriteRight History Export</title>
        <style>
          body { font-family: sans-serif; color: #000; padding: 20px; }
          .wr-export-entry { margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom: 20px; }
          .wr-export-user { font-weight: bold; margin-bottom: 10px; }
          .wr-export-ai { margin-top: 15px; padding-left: 15px; border-left: 3px solid #ccc; }
        </style>
        </head><body>
          <h2>WriteRight Interaction History</h2>
          <p>Exported on: ${new Date().toLocaleString()}</p>
          <hr />
          ${(data.chats as ExportChat[] | undefined)?.map((c) => `
            <div class="wr-export-entry">
              <h3>Chat: ${escapeHtml(c.title)}</h3>
              ${c.messages.map((m) => `
                <div class="${m.role === 'user' ? 'wr-export-user' : 'wr-export-ai'}">
                  <span style="font-size:12px;color:#666;">${m.role === 'user' ? 'You' : 'WriteRight'} (${new Date(m.timestamp).toLocaleDateString()})</span><br/>
                  ${m.role === 'ai'
          ? escapeHtml(safeExtractImproved(m.content))
          : escapeHtml(m.content)}
                </div>
              `).join('')}
            </div>
          `).join('') || '<p>No history available.</p>'}
        </body></html>
      `)
      iframe.contentWindow?.document.close()

      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => {
          document.body.removeChild(iframe)
          setIsExporting(false)
        }, 1000)
      }, 500)
    } catch (err) {
      console.error('Export failed', err); showError('Failed to export. Please try again.')
      setIsExporting(false)
    }
  }, [showError])

  const submit = useCallback(async (text?: string, forcedTone?: ToneOption) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    const toneToUse = forcedTone ?? tone
    const submitOutputLang: OutputLang = (mode === 'email' || mode === 'whatsapp') ? outputLang : 'en'
    const submissionSignature = JSON.stringify([
      chatId ?? 'new',
      msg,
      toneToUse,
      mode,
      intensity,
      submitOutputLang,
    ])
    const idempotencyKey = pendingSubmissionRef.current?.signature === submissionSignature
      ? pendingSubmissionRef.current.key
      : makeClientId('idem')
    pendingSubmissionRef.current = { signature: submissionSignature, key: idempotencyKey }

    setLastSubmittedText(msg)
    setLoading(true)
    loadingStartRef.current = Date.now()
    setInput('')
    setFileBadge(null)
    setFileError(null)
    setStreamingText('')
    setStreamingBefore(msg)
    if (isRecording) stopRecording()
    if (taRef.current) taRef.current.style.height = 'auto'

    setHasStarted(true)
    setMessages((prev) => [...prev, {
      id: makeClientId('user'),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    }])
    scrollBottom()

    try {
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller

      let activeChatId = chatId
      if (!activeChatId) {
        const chatRes = await apiPost<CreateChatResponse>('/api/writeright/chat', {
          title: msg.slice(0, 100),
          mode,
        })
        activeChatId = chatRes.chat.id
        setChatId(activeChatId)
        void loadChats()
      }

      const submitRes = await apiPost<SubmitMessageResponse>('/api/writeright/message', {
        chatId: activeChatId,
        text: msg,
        tone: toneToUse,
        mode,
        intensity,
        output_language: submitOutputLang,
      }, {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
      })

      let result: AIJobResult
      let resolvedJobId: string | null = null

      if (submitRes.status === 'completed' && submitRes.jobId === 'cached') {
        result = submitRes.result
      } else {
        resolvedJobId = submitRes.jobId
        result = await streamJobResult(submitRes.jobId, controller.signal, getToken, {
          onToken: (chunk) => {
            setStreamingText((prev) => `${prev}${chunk}`)
          },
        })
      }

      // ENHANCE-02: Extract prevScores from previous AI message for delta
      const prevAiMsg = [...messages]
        .reverse()
        .find((m): m is Extract<WriteRightMessage, { role: 'ai'; kind: 'result' }> => (
          m.role === 'ai' && m.kind === 'result' && Boolean(m.jobResult.scores)
        ))
      const prevScores = prevAiMsg?.jobResult.scores ?? undefined

      const resultMessage = buildAiResultMessage({
        before: msg,
        result,
        jobId: resolvedJobId,
        chatId: activeChatId,
        mode,
        tone: toneToUse,
        intensity,
        outputLang: submitOutputLang,
        prevScores,
      })

      setLastImprovedText(result.improved_text); localStorage.removeItem(`wr:draft:${activeChatId}`)
      if (msg.startsWith('Challenge:')) {
        setChallengeDone(true)
        try { localStorage.setItem('wr:c:' + todayKey, '1') } catch { }
      }
      setResultAnnouncement(result.scores?.verdict
        ? `WriteRight finished. Verdict: ${result.scores.verdict}`
        : 'WriteRight finished improving your draft.')
      if (activeChatId && isUuidLike(resolvedJobId)) {
        setLastResultMeta({ mode, tone: toneToUse, chatId: activeChatId, jobId: resolvedJobId })
      }
      setMessages((prev) => [...prev, resultMessage])
      setStreamingText('')
      setStreamingBefore('')
      scrollBottom()
      void loadChats()

      // ENHANCE-04: Increment session momentum
      setSessionCount(prev => prev + 1)

      // ENHANCE-06: Trigger shortcut tip after 3rd improvement
      playShimmer()
      if (sessionCount === 2) {
        try {
          const dismissed = localStorage.getItem('wr:shortcut-tip')
          if (!dismissed) setShowShortcutTip(true)
        } catch { }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — add a subtle divider so they know it stopped
        setMessages((prev) => [
          ...prev,
          {
            id: makeClientId('notice'),
            role: 'ai',
            kind: 'notice',
            content: 'Cancelled',
          },
        ])
        return
      }
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      const errCode = typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'INTERNAL_ERROR'
      showError(errorMessage, errCode)
      // Remove the optimistic user message and add inline retry card
      setMessages(items => items.slice(0, -1))
      const retryText = lastSubmittedText ?? msg
      setMessages((prev) => [...prev, {
        id: makeClientId('error'),
        role: 'ai',
        kind: 'error',
        content: errorMessage,
        retryText,
      }])
      scrollBottom()
    } finally {
      pendingSubmissionRef.current = null
      setLoading(false)
      loadingStartRef.current = null
      setStreamingText('')
      setStreamingBefore('')
    }
  }, [
    chatId,
    input,
    intensity,
    isRecording,
    getToken,
    lastSubmittedText,
    loadChats,
    loading,
    messages,
    mode,
    outputLang,
    buildAiResultMessage,
    scrollBottom,
    sessionCount,
    stopRecording,
    tone,
    showError,
    todayKey,
    setChallengeDone,
    playShimmer,
  ])

  useEffect(() => {
    submitRef.current = async (text?: string, forcedTone?: ToneOption) => submit(text, forcedTone)
  }, [submit])

  const handleFileExtract = useCallback(async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      setFileError('File too large. Max size is 4MB.')
      return
    }

    setFileError(null)
    setFileBadge({ name: file.name, loading: true })

    try {
      const formData = new FormData()
      formData.append('file', file)
      const extracted = await apiPostForm<ExtractResponse>('/api/writeright/extract', formData)
      setInput(extracted.text.slice(0, CHAR_MAX))
      if (taRef.current) {
        taRef.current.focus()
        taRef.current.style.height = 'auto'
        taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 320)}px`
      }
      setFileBadge({ name: file.name, loading: false })
      if (extracted.truncated) {
        setFileError('Extracted text was truncated to fit character limit.')
      }
    } catch {
      setFileBadge(null)
      setFileError('Could not read this file. Paste the text manually.')
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setIsFocusMode((prev) => !prev)
        return
      }

      const meta = e.ctrlKey || e.metaKey
      const activeElement = document.activeElement
      const inTextArea = activeElement === taRef.current
      const inEditable =
        inTextArea ||
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)

      if (e.key === 'Escape') {
        setSplitSelection(null)
        setSelectedSentenceIndex(null)
        setTemplatePanelOpen(false)
        setEmailChainOpen(false)
        setShowGrammar(false)
        if (showShortcutsModal) {
          e.preventDefault()
          setShowShortcutsModal(false)
          return
        }
        if (searchQuery.trim()) {
          setSearchQuery('')
        }
        if (loading) {
          abortRef.current?.abort()
          return
        }
      }

      if (meta && e.key === '/') {
        e.preventDefault()
        setShowShortcutsModal(true)
        return
      }

      if (!meta && !inEditable && e.key === '?') {
        e.preventDefault()
        setShowShortcutsModal(true)
        return
      }

      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        taRef.current?.focus()
        return
      }

      if (meta && e.key === 'Enter' && inTextArea) {
        e.preventDefault()
        void submitRef.current()
        return
      }

      if (meta && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (lastImprovedText.trim()) {
          openSaveTemplateModal(lastImprovedText, lastResultMeta?.mode ?? mode, lastResultMeta?.tone ?? tone)
        }
        return
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        if (lastImprovedText.trim()) {
          void copyTextToClipboard(lastImprovedText)
        }
        return
      }

      if (!inEditable && !meta && ['1', '2', '3', '4'].includes(e.key)) {
        const modeMap: Record<string, WritingMode> = {
          '1': 'email',
          '2': 'paragraph',
          '3': 'linkedin',
          '4': 'whatsapp',
        }
        handleModeChange(modeMap[e.key])
        return
      }

      if (!inEditable && !meta && e.key.toLowerCase() === 't') {
        e.preventDefault()
        setTone((prev) => {
          const idx = TONES.indexOf(prev)
          const next = idx >= 0 ? (idx + 1) % TONES.length : 0
          return TONES[next]
        })
        return
      }

      if (!inEditable && !meta && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        handleModeChange('email')
        return
      }

      if (!inEditable && !meta && e.key === 'Backspace' && hasStarted) {
        e.preventDefault()
        setChatId(null)
        setMessages([])
        setHasStarted(false)
        setInput('')
        setSearchQuery('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    copyTextToClipboard,
    handleModeChange,
    hasStarted,
    lastImprovedText,
    lastResultMeta?.mode,
    lastResultMeta?.tone,
    loading,
    mode,
    openSaveTemplateModal,
    searchQuery,
    showShortcutsModal,
    tone,
  ])


  return (
    <div className={`wr-workspace-container${isFocusMode ? ' wr-focus-mode' : ''}`} data-module="write">
      {/* GAME-1: Achievement milestone banner */}
      {achievementBanner && (
        <div className="wr-achievement-banner" role="status">
          {achievementBanner}
          <button className="wr-achievement-close" onClick={() => setAchievementBanner(null)}>×</button>
        </div>
      )}

      <div className="wr-left-col">
        <div className="wr-rail">

          {/* Back Button — inside the rail so position:absolute resolves correctly */}
          <button
            className="wr-back-btn"
            onClick={() => router.push('/dashboard')}
            aria-label="Back to Dashboard"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>

          <div className="wr-rail-top">
            <button className="wr-rail-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Toggle history">
              {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <button className="wr-rail-btn" onClick={() => handleModeChange('email')} aria-label="New Chat">
              <Plus size={16} />
            </button>
            <button className="wr-rail-btn" onClick={() => { setIsSidebarOpen(true); setTimeout(() => (document.querySelector('.wr-search-field') as HTMLElement)?.focus(), 250) }} aria-label="Search">
              <Search size={16} />
            </button>
          </div>
          <div className="wr-rail-bottom">
            <button className="wr-rail-btn" onClick={() => setAnalyticsOpen(!analyticsOpen)} aria-label="Stats">
              <BarChart3 size={16} />
            </button>
            <button className="wr-rail-btn" onClick={handleExport} disabled={isExporting} aria-label="Export">
              {isExporting ? <Loader2 size={16} className="wr-spin" /> : <Download size={16} />}
            </button>
          </div>
        </div>

        <div className={`wr-drawer-panel${!isSidebarOpen ? ' collapsed' : ''}`}>
          <div className="wr-drawer-header">
            <span className="wr-drawer-title">WriteRight</span>
            {stats && stats.streak.current >= 2 && (
              <span className="wr-streak-badge">{stats.streak.current}d 🔥</span>
            )}
          </div>

          <div className="wr-search-wrapper">
            <Search size={14} className="wr-search-icon-left" />
            <input
              className="wr-search-field"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery.trim() && (
              <button className="wr-search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="wr-sidebar-scroll">
            {searchQuery.trim() && (
              <>
                {searchLoading && <p className="wr-sidebar-empty-text-text">Searching…</p>}
                {!searchLoading && searchResults.length === 0 && (
                  <p className="wr-sidebar-empty-text-text">No matching chats.</p>
                )}
                {!searchLoading && searchResults.map((result) => (
                  <div
                    key={result.chatId}
                    className="wr-item"
                    onClick={() => { void selectChat(result.chatId, result.mode) }}
                  >
                    <div className="wr-item-title">{highlightText(result.chatTitle, searchQuery)}</div>
                    <div className="wr-search-snippet">{highlightText(result.messageSnippet, searchQuery)}</div>
                  </div>
                ))}
              </>
            )}

            {!searchQuery.trim() && (
              <>
                <details open>
                  <summary className="wr-section-header">Chats</summary>
                  {chats.length === 0 && (
                    <p className="wr-sidebar-empty-text-text">Your writing sessions will appear here.</p>
                  )}
                  {chats.map((c) => (
                    <div
                      key={c.id}
                      className={`wr-item${chatId === c.id ? ' is-active' : ''}`}
                      data-mode={c.mode}
                      onClick={() => { void selectChat(c.id, c.mode) }}
                    >
                      <div className="wr-item-title">{c.title || 'New Conversation'}</div>
                      <div className="wr-item-meta">
                        <span className="wr-item-date">
                          {new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        {c.message_count > 0 && (
                          <span className="wr-item-count">{c.message_count}</span>
                        )}
                      </div>
                      <button className="wr-item-delete" onClick={(e) => { void deleteChat(e, c.id) }} aria-label="Delete chat">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </details>

                <details open>
                  <summary className="wr-section-header flex items-center justify-between w-full">
                    <span>Templates</span>
                    <button
                      type="button"
                      className="wr-template-settings-btn"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setTemplatePanelOpen(true)
                      }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
                      title="Template Panel"
                    >
                      <Settings2 size={12} />
                    </button>
                  </summary>
                  {templates.length === 0 && (
                    <p className="wr-sidebar-empty-text-text">No templates saved yet.</p>
                  )}
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="wr-item"
                      data-mode={template.mode}
                      onClick={() => {
                        setInput(template.content.slice(0, CHAR_MAX))
                        setMode(template.mode)
                        setTone(template.tone)
                        void markUsed(template.id)
                        taRef.current?.focus()
                      }}
                    >
                      <div className="wr-item-title">{template.name}</div>
                      <div className="wr-item-meta">
                        <span className="wr-item-date">{template.tone}</span>
                        <span className="wr-item-count">{template.use_count}</span>
                      </div>
                    </div>
                  ))}
                </details>
              </>
            )}
          </div>
          {!searchQuery.trim() && chats.length === 1 && (
            <div className="wr-onboard-hint">
              <p>Your history is saved here. Each chat is a writing session you can revisit.</p>
            </div>
          )}

          {/* StatsPanel removed as it is now replaced by AnalyticsView */}
        </div>
      </div>

      <div className="wr-main" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="wr-plan-bar">
          <div className="wr-plan-badge">
            <span className="wr-plan-badge-dot" />
            <span>Pro Plan</span>
            <span style={{ margin: '0 4px', opacity: 0.4 }}>•</span>
            <Link href="/dashboard/settings" className="wr-plan-upgrade">
              Manage Plan
            </Link>
          </div>
        </div>

        {/* Gmail Panel — slides in from right */}
        {gmail.connectionStatus.connected && (
          <GmailPanel
            panel={gmail.panel}
            connectionStatus={gmail.connectionStatus}
            onClose={gmail.togglePanel}
            onSelectEmail={(id) => { void gmail.selectEmail(id) }}
            onRefresh={() => { void gmail.fetchEmails() }}
            onFilterChange={gmail.setFilter}
            onToggleUnread={gmail.toggleUnreadOnly}
            onLoadMore={gmail.loadMore}
            onDisconnect={() => { void gmail.disconnect() }}
            searchQuery={gmail.searchQuery}
            setSearchQuery={gmail.setSearchQuery}
            selectedEmails={gmail.selectedEmails}
            onToggleSelect={gmail.toggleSelect}
            unreadCount={gmail.unreadCount}
            onOpenCompose={() => setEmailChainOpen(true)}
            scheduledSends={gmail.scheduledSends}
            onCancelScheduled={gmail.cancelScheduled}
            onViewContact={gmail.fetchContactIntel}
            activeFilter={activeFilter}
            setActiveFilter={handleActiveFilterChange}
            onFetchScheduled={gmail.fetchScheduledSends}
          />
        )}

        {/* Gmail Email Preview Overlay */}
        {gmail.panel.previewOpen && gmail.panel.selectedEmail && (
          <GmailEmailPreview
            email={gmail.panel.selectedEmail}
            onClose={gmail.closePreview}
            onImport={handleGmailImport}
            onViewContact={gmail.fetchContactIntel}
            smartComposeText={gmail.smartComposeText}
            smartComposeLoading={gmail.smartComposeLoading}
            onRunSmartCompose={gmail.smartCompose}
            onClearSmartCompose={() => gmail.setSmartComposeText('')}
            onUseDraft={(text) => { setInput(text.slice(0, CHAR_MAX)); gmail.closePreview(); }}
            emailsList={gmail.panel.emails}
          />
        )}

        {!isSidebarOpen && (
          <button
            className="wr-sidebar-reopen"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        <div className="wr-scroll" ref={scrollRef}>
          <div className="wr-content">
            {templatePanelOpen ? (
              <TemplatePanel
                onUseTemplate={(content, tplMode, tplTone) => {
                  setInput(content.slice(0, CHAR_MAX))
                  setMode(tplMode)
                  setTone(tplTone)
                  setTemplatePanelOpen(false)
                }}
                onClose={() => setTemplatePanelOpen(false)}
              />
            ) : isSplitView ? (
              <WriteSplitView
                originalText={lastSubmittedText || ""}
                improvedText={lastImprovedText || ""}
                selectedSentenceIndex={selectedSentenceIndex}
                onSelectSentence={handleSelectSentence}
              />
            ) : !hasStarted ? (
              <div className="wr-empty">
                <div className="wr-empty-icon-wrap" aria-hidden="true">
                  <Wand2 size={28} strokeWidth={1.7} />
                </div>
                <h1 className="wr-empty-title">WriteRight</h1>
                <p className="wr-empty-sub">How would you like to improve this?</p>

                <div className="wr-chips-grid">
                  {[...MODE_PROMPTS[mode]].sort((a, b) => (chipCounts[b.title] || 0) - (chipCounts[a.title] || 0)).map((p) => {
                    const isNew = (chipCounts[p.title] || 0) === 0
                    return (
                      <button
                        key={p.title}
                        className="wr-chip"
                        onClick={(e) => {
                          const btn = e.currentTarget
                          const rect = btn.getBoundingClientRect()
                          const dot = document.createElement('span')
                          dot.className = 'wr-ripple'
                          dot.style.left = `${e.clientX - rect.left}px`
                          dot.style.top = `${e.clientY - rect.top}px`
                          btn.appendChild(dot)
                          setTimeout(() => dot.remove(), 500)
                          const newCounts = { ...chipCounts, [p.title]: (chipCounts[p.title] || 0) + 1 }
                          setChipCounts(newCounts)
                          localStorage.setItem('wr:chipCounts', JSON.stringify(newCounts))
                          void submitRef.current(p.full)
                        }}
                      >
                        <span className="wr-chip-title-row">
                          {p.title}
                          {isNew && <span className="wr-chip-new-dot" aria-hidden="true" />}
                          <ArrowUpRight size={13} className="wr-chip-arrow" />
                        </span>
                        <span className="wr-chip-sub">{p.sub}</span>
                        <span className="wr-chip-tooltip">{p.sub}</span>
                      </button>
                    )
                  })}
                </div>

                {!challengeDismissed && (
                  <div className={`wr-challenge${challengeDone ? ' done' : ''}`}>
                    <div className="wr-challenge-icon">🎯</div>
                    <div className="wr-challenge-body">
                      <p className="wr-challenge-title">Daily Challenge: {todayChallenge.title}</p>
                      <p className="wr-challenge-desc">{todayChallenge.desc}</p>
                    </div>
                    {!challengeDone ? (
                      <button
                        className="wr-challenge-action"
                        onClick={() => {
                          setInput(`Challenge: ${todayChallenge.desc}`)
                          taRef.current?.focus()
                        }}
                      >
                        Use prompt
                      </button>
                    ) : (
                      <span className="wr-challenge-done-label">Done for today</span>
                    )}
                    <button
                      className="wr-challenge-dismiss"
                      aria-label="Dismiss daily challenge"
                      onClick={() => {
                        setChallengeDismissed(true)
                        try { localStorage.setItem('wr:cd:' + todayKey, '1') } catch { }
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="wr-messages">
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  className="wr-sr"
                >
                  {resultAnnouncement}
                </div>

                {isTriageMode ? (
                  <div className="wr-triage-container">
                    <div className="wr-triage-header">
                      <div className="wr-triage-header-text">
                        <h2 className="wr-triage-title">Inbox Zero Triage</h2>
                        <p className="wr-triage-subtitle">AI-segmented view of your bulk emails and threads.</p>
                      </div>
                      <button
                        className="wr-triage-run-btn"
                        onClick={handleTriage}
                        disabled={triageLoading || !input.trim()}
                      >
                        {triageLoading ? 'Analyzing…' : 'Run Triage'}
                      </button>
                    </div>
                    {triageItems.length > 0 ? (
                      <TriageBoard
                        items={triageItems}
                        onStartDraft={(draft) => {
                          setInput(draft)
                          setIsTriageMode(false)
                        }}
                      />
                    ) : (
                      <div className="wr-triage-welcome">
                        <div className="wr-triage-welcome-icon">📥</div>
                        <h3>Ready to triage?</h3>
                        <p>Paste your bulk emails or a long thread below and click &quot;Run Triage&quot;.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((m, i) => {
                      const isLastAi = m.role === 'ai' && i === messages.map((msg) => msg.role).lastIndexOf('ai')
                      return (
                        <React.Fragment key={m.id}>

                          {m.role === 'user' && (
                            <div className="wr-user-row">
                              <div className="wr-user-bubble">{m.content}</div>
                            </div>
                          )}
                          {m.role === 'ai' && m.kind === 'result' && (
                            <div className="wr-ai-row">
                              <div className="wr-ai-header">
                                <div className="wr-ai-avatar">✍️</div>
                                <span className="wr-ai-label">Writeright</span>
                              </div>
                              <WriteDiffBlock
                                before={m.before}
                                after={m.jobResult.improved_text}
                                isMorphing={isMorphing && i === messages.length - 1}
                                explanation={(() => {
                                  const explanationParts: string[] = []
                                  if (m.jobResult.teaching?.mistakes?.length) {
                                    explanationParts.push(m.jobResult.teaching.mistakes[0])
                                  }
                                  if (m.jobResult.teaching?.explanations?.length) {
                                    explanationParts.push(m.jobResult.teaching.explanations[0])
                                  }
                                  return explanationParts.join(' — ') || 'AI-improved version of your text.'
                                })()}
                                teaching={m.jobResult.teaching}
                                followUp={m.jobResult.follow_up}
                                suggestions={m.jobResult.suggestions}
                                scores={m.jobResult.scores}
                                prevScores={m.prevScores}
                                englishVersion={m.jobResult.english_version}
                                outputLang={m.outputLang}
                                jobId={m.jobId}
                                chatId={m.chatId}
                                mode={m.mode}
                                tone={m.tone}
                                onSuggest={(suggestion) => { void submitRef.current(suggestion) }}
                                onSaveTemplate={() => openSaveTemplateModal(m.jobResult.improved_text, m.mode, m.tone)}
                                onShare={isUuidLike(m.jobId) && typeof m.chatId === 'string' ? () => openShareModal({
                                  before: m.before,
                                  after: m.jobResult.improved_text,
                                  mode: m.mode,
                                  tone: m.tone,
                                  chatId: m.chatId!,
                                  jobId: m.jobId!,
                                }) : undefined}
                              />
                            </div>
                          )}
                          {m.role === 'ai' && m.kind === 'notice' && (
                            <div className="wr-ai-row">
                              <div className="wr-ai-header">
                                <div className="wr-ai-avatar">✍️</div>
                                <span className="wr-ai-label">Notice</span>
                              </div>
                              {m.content === 'Cancelled' || m.content.startsWith('Switched to ')
                                ? <div className="wr-divider-line">{m.content}</div>
                                : <div className="wr-improved-text">{m.content}</div>
                              }
                            </div>
                          )}
                          {m.role === 'ai' && m.kind === 'error' && (
                            <div className="wr-ai-row">
                              <div className="wr-ai-header">
                                <div className="wr-ai-avatar">✍️</div>
                                <span className="wr-ai-label">Error</span>
                              </div>
                              <InlineError
                                message={m.content}
                                onRetry={() => {
                                  setMessages((items) => items.filter((item) => item.id !== m.id))
                                  void submitRef.current(m.retryText)
                                }}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </>
                )}

                {loading && !streamingText && <WriteRightThinking startTime={loadingStartRef.current} />}

                {loading && streamingText && (
                  <div className="wr-ai-row">
                    <div className="wr-ai-header">
                      <div className="wr-ai-avatar">✍️</div>
                      <span className="wr-ai-label">Writing...</span>
                    </div>
                    <WriteDiffBlock
                      before={streamingBefore || (lastSubmittedText ?? 'Your draft')}
                      after={streamingText}
                      explanation="Streaming response..."
                      outputLang={outputLang}
                      streaming
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Standard Input Bar ── */}
        <div className="wr-composer-bar">
          <div className="wr-composer-bar-inner">
            <div className={`wr-card${loading ? ' is-loading' : ''}${showSelectors ? ' show-selectors' : ''}`}>
              <div className="wr-mode-row">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`wr-mode-tab${mode === m.id ? ' active' : ''}`}
                    onClick={() => handleModeChange(m.id)}
                    role="tab"
                    aria-selected={mode === m.id}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="wr-tone-row">
                {TONES.map((t) => (
                  <div key={t} className="wr-tone-wrap">
                    <button className={`wr-tone-pill${tone === t ? ' active' : ''}`} onClick={() => setTone(t)}>
                      {t}
                    </button>
                    <div className="wr-tone-tip">{TONE_DESCRIPTIONS[t]}</div>
                    <TonePreviewTooltip text={input} tone={t} />
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {shouldShowRantBanner && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="wr-rant"
                    role="alert"
                  >
                    <p className="wr-rant-head">This reads heated.</p>
                    <p className="wr-rant-sub">Keep it as-is, or cool it down to a friendlier professional tone.</p>
                    <div className="wr-rant-btns">
                      <button type="button" className="wr-rant-keep" onClick={() => setRantDismissed(true)}>
                        Keep as-is
                      </button>
                      <button
                        type="button"
                        className="wr-rant-cool"
                        onClick={() => {
                          setRantDismissed(true)
                          void submitRef.current(undefined, 'Friendly')
                        }}
                        disabled={loading || !input.trim()}
                      >
                        <Smile size={12} />
                        Cool it down
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {(fileBadge || fileError || draftSaveWarning) && (
                <div className="wr-alerts">
                  {fileBadge && (
                    <div className="wr-file-chip">
                      <span>{fileBadge.loading ? `Extracting ${fileBadge.name}…` : fileBadge.name}</span>
                      <button className="wr-file-chip-remove" onClick={() => setFileBadge(null)} aria-label="Remove file badge">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {fileError && <div className="wr-alert-row"><span>{fileError}</span></div>}
                  {draftSaveWarning && <div className="wr-alert-row"><span>{draftSaveWarning}</span></div>}
                </div>
              )}

              <CoachBar metrics={coachMetrics!} visible={Boolean(coachMetrics && preferences?.uiPreferences?.coachBarEnabled !== false && !isFocusMode)} />
              <div className="wr-textarea-wrap wr-pulse-wrap" style={{ '--writing-clarity-color': clarityColor } as React.CSSProperties}>
                {pulse && <div className="wr-pulse-ring" />}
                {showGrammar ? (
                  <GrammarOverlay text={input} isActive={showGrammar} onChange={setInput} />
                ) : (
                  <textarea
                    ref={taRef}
                    className="wr-textarea"
                    placeholder={MODE_PLACEHOLDERS[mode]}
                    value={input}
                    onChange={(e) => { playClick(); setInput(e.target.value) }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onInput={(e) => {
                      const t = e.currentTarget
                      t.style.height = 'auto'
                      t.style.height = `${Math.min(t.scrollHeight, 220)}px`
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void submitRef.current()
                      }
                    }}
                    rows={3}
                    maxLength={CHAR_MAX}
                  />
                )}
                {ghosting && ghostText && (
                  <div className="wr-ghost">
                    {ghostText}
                  </div>
                )}
                {charDisplay && (
                  <p className={`wr-charcount${charClass ? ` ${charClass}` : ''}`}>
                    {charDisplay}
                  </p>
                )}
              </div>

              <div className="wr-footer">
                <div className="wr-tools-left">
                  <button
                    type="button"
                    className={`wr-tool${showAdvancedTools ? ' active' : ''}`}
                    aria-label="More tools"
                    onClick={() => setShowAdvancedTools(!showAdvancedTools)}
                  >
                    <Plus size={16} />
                  </button>

                  {(mounted && voiceSupported) && (
                    <button
                      type="button"
                      className={`wr-tool${isRecording ? ' active' : ''}`}
                      aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                      aria-pressed={isRecording}
                      onClick={toggleRecording}
                    >
                      {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0]
                      if (file) void handleFileExtract(file)
                      e.currentTarget.value = ''
                    }}
                  />
                  <button className="wr-tool" aria-label="Attach file" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip size={16} />
                  </button>

                  {/* Gmail integration button */}
                  {gmail.connectionStatus.connected ? (
                    <GmailConnectedBadge
                      email={gmail.connectionStatus.connection?.gmail_email ?? ''}
                      onTogglePanel={gmail.togglePanel}
                      panelOpen={gmail.panel.isOpen}
                      unreadCount={gmail.unreadCount}
                    />
                  ) : (
                    <GmailConnectButton
                      onConnect={gmail.connect}
                      loading={gmail.connectionLoading}
                    />
                  )}

                  {isRecording && (
                    <div className="wr-recording" aria-live="polite">
                      <span className="wr-rec-dot" />
                      Recording
                    </div>
                  )}
                </div>

                <div className="wr-tools-right">
                  {/* Mode+Tone selector button — toggles the mode/tone rows */}
                  <button
                    type="button"
                    className={`wr-selector-btn${showSelectors ? ' active' : ''}`}
                    onClick={() => setShowSelectors(!showSelectors)}
                    aria-label="Select mode and tone"
                    aria-expanded={showSelectors}
                  >
                    {MODES.find(m => m.id === mode)?.label ?? 'Email'}
                    <span style={{ color: '#9C9489', fontSize: '11px' }}>·</span>
                    {tone}
                    <ChevronDown size={12} className="wr-selector-chevron" />
                  </button>
                  <button
                    type="button"
                    className="wr-shortcut-q"
                    aria-label="Keyboard Shortcuts"
                    onClick={() => setShowShortcutsModal(true)}
                  >
                    ?
                    <div className="wr-shortcut-tip">
                      Ctrl+Enter  Submit<br />
                      Escape      Cancel<br />
                      Ctrl+K      Focus<br />
                      1-4         Change Mode<br />
                      T           Cycle tone<br />
                      N           New chat<br />
                      Ctrl+S      Save output<br />
                      Ctrl+Shift+C Copy output
                    </div>
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    className="wr-send"
                    onClick={() => { void submitRef.current() }}
                    disabled={!input.trim() || loading}
                    aria-label="Improve text"
                  >
                    {loading
                      ? <>{[0, 1, 2].map((i) => <span key={i} className="wr-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}</>
                      : <><Wand2 size={13} strokeWidth={2.2} /> Improve</>
                    }
                  </motion.button>
                </div>
              </div>
              {/* Advanced Tools Panel — floats above the footer */}
              {showAdvancedTools && (
                <div className="wr-adv-panel">
                  {(mode === 'email' || mode === 'whatsapp') && (
                    <select
                      className="wr-lang-select"
                      value={outputLang}
                      onChange={(e) => setOutputLang(e.target.value as OutputLang)}
                      aria-label="Translate output language"
                    >
                      {OUTPUT_LANG_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  )}

                  {(mounted && voiceSupported) && (
                    <button
                      type="button"
                      className="wr-lang-pill"
                      onClick={cycleVoiceLang}
                      aria-label="Change voice input language"
                    >
                      {VOICE_LANGS.find((lang) => lang.id === voiceLang)?.label ?? 'AUTO'}
                    </button>
                  )}

                  <button
                    type="button"
                    className={`wr-tool${!isMuted ? ' active' : ''}`}
                    onClick={toggleMute}
                    aria-label="Toggle haptics"
                    title="Mechanical haptics"
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <div className="wr-depth-wrap">
                    <button type="button" className="wr-tool" aria-label="Rewrite depth">
                      <Settings2 size={16} />
                    </button>
                    <div className="wr-depth-pop">
                      <div className="wr-depth-head">
                        <span>Depth</span>
                        <strong className="wr-depth-val">
                          {intensity === 1 ? 'Preserve' :
                            intensity === 2 ? 'Light' :
                              intensity === 3 ? 'Standard' :
                                intensity === 4 ? 'Active' :
                                  'Full'}
                        </strong>
                      </div>
                      <input
                        type="range"
                        className="wr-depth-slider"
                        min="1"
                        max="5"
                        step="1"
                        value={intensity}
                        onChange={(e) => setIntensity(Number(e.target.value))}
                        style={{ '--slider-pct': `${(intensity - 1) * 25}%` } as React.CSSProperties}
                        aria-valuenow={intensity}
                        aria-valuemin={1}
                        aria-valuemax={5}
                      />
                    </div>
                  </div>

                  <button
                    className={`wr-tool${isTriageMode ? ' active' : ''}`}
                    aria-label="Inbox Triage Board"
                    title="Bulk Inbox Triage"
                    onClick={() => setIsTriageMode(!isTriageMode)}
                  >
                    <Layout size={16} />
                  </button>

                  <button
                    className="wr-tool"
                    aria-label="Brand Voice DNA"
                    title="Train AI Voice"
                    onClick={() => setVoiceModalOpen(true)}
                  >
                    <Fingerprint size={16} />
                  </button>

                  <button
                    className="wr-tool muted"
                    aria-label="Paste or attach image (coming soon)"
                    title="Image input — coming soon"
                  >
                    <ImagePlus size={16} />
                  </button>

                  <button
                    type="button"
                    className={`wr-tool${builderOpen ? ' active' : ''}`}
                    onClick={() => setBuilderOpen((prev) => !prev)}
                    aria-expanded={builderOpen}
                    aria-label="Open writing brief"
                  >
                    <LayoutTemplate size={16} />
                  </button>

                  <button
                    type="button"
                    className={`wr-tool${isSplitView ? ' active' : ''}`}
                    onClick={() => setIsSplitView(!isSplitView)}
                    aria-label="Toggle Split View"
                    title="Split View Comparison"
                  >
                    <Columns size={16} />
                  </button>

                  <button
                    type="button"
                    className={`wr-tool${showGrammar ? ' active' : ''}`}
                    onClick={() => setShowGrammar(!showGrammar)}
                    aria-label="Toggle Grammar Scan"
                    title="Grammar Scan"
                  >
                    <CheckCheck size={16} />
                  </button>

                  <button
                    type="button"
                    className={`wr-tool${isFocusMode ? ' active' : ''}`}
                    onClick={() => setIsFocusMode(!isFocusMode)}
                    aria-label="Toggle Focus Mode"
                    title="Focus Mode"
                  >
                    <Maximize2 size={16} />
                  </button>

                  <button
                    type="button"
                    className={`wr-tool${emailChainOpen ? ' active' : ''}`}
                    onClick={() => setEmailChainOpen(!emailChainOpen)}
                    aria-label="Toggle Email Chain"
                    title="Email Chain Optimizer"
                  >
                    <Link2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {builderOpen && (
          <div className="wr-builder">
            <p className="wr-builder-head">Brief</p>
            <input
              className="wr-builder-input"
              placeholder="Audience"
              value={builderObj.audience}
              onChange={(e) => setBuilderObj({ ...builderObj, audience: e.target.value })}
            />
            <input
              className="wr-builder-input"
              placeholder="Purpose"
              value={builderObj.purpose}
              onChange={(e) => setBuilderObj({ ...builderObj, purpose: e.target.value })}
            />
            <input
              className="wr-builder-input"
              placeholder="Key points, comma separated"
              value={builderObj.points}
              onChange={(e) => setBuilderObj({ ...builderObj, points: e.target.value })}
            />
            <button
              type="button"
              className="wr-builder-submit"
              onClick={() => {
                const hasContent = builderObj.audience.trim() ||
                  builderObj.purpose.trim() ||
                  builderObj.points.trim()
                if (!hasContent) return
                const prompt = `Audience: ${builderObj.audience}\nPurpose: ${builderObj.purpose}\nPoints to cover:\n- ${builderObj.points.split(',').join('\n- ')}`
                setInput(prompt)
                setBuilderOpen(false)
                setBuilderObj({ audience: '', purpose: '', points: '' })
              }}
            >
              Fill draft
            </button>
          </div>
        )}

        <p className="wr-disclaimer">
          WriteRight may make mistakes. Always review AI-generated text before sending.
        </p>

        {showShortcutTip && (
          <button
            className="wr-tip-toast"
            onClick={() => {
              setShowShortcutTip(false)
              try { localStorage.setItem('wr:shortcut-tip', '1') } catch { }
            }}
            type="button"
          >
            Tip: press <kbd>T</kbd> to cycle tones · <kbd>1-4</kbd> switches modes
            <span className="wr-tip-got-it">got it ×</span>
          </button>
        )}
      </div>



      <ShortcutsModal open={showShortcutsModal} onClose={() => setShowShortcutsModal(false)} />
      <SaveTemplateModal
        key={`${saveModalOpen}-${saveTemplatePrefill}`}
        open={saveModalOpen}
        defaultName={saveTemplatePrefill}
        onClose={() => setSaveModalOpen(false)}
        onSave={(name) => { void saveTemplateFromModal(name) }}
      />
      <ShareModal
        open={shareModalOpen}
        payload={sharePayload}
        onClose={() => setShareModalOpen(false)}
      />

      <BrandVoiceModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
      />

      <AnalyticsView isOpen={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
      
      <EmailChainView isOpen={emailChainOpen} onClose={() => setEmailChainOpen(false)} />

      {splitSelection && splitSelection.rect && (
        <div
          className="wr-refine-pop"
          style={{
            position: 'absolute',
            zIndex: 100,
            top: splitSelection.rect.top - 50 + window.scrollY,
            left: splitSelection.rect.left + (splitSelection.rect.width / 2) - 130
          }}
        >
          <input
            className="wr-refine-input"
            placeholder="How should I change this?..."
            value={splitRefinePrompt}
            onChange={(e) => setSplitRefinePrompt(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSplitRefine()}
          />
          <button
            className="wr-refine-submit"
            disabled={isSplitRefining || !splitRefinePrompt.trim()}
            onClick={handleSplitRefine}
          >
            {isSplitRefining ? '...' : 'Refine'}
          </button>
        </div>
      )}

      <div className="wr-toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`wr-toast wr-toast-${t.type || 'info'}`}
          >
            <span>{t.msg}</span>
            <div className="wr-toast-btns">
              {['QUEUE_ERROR', 'STREAM_ERROR'].includes(t.code || '') && (
                <button
                  className="wr-toast-action"
                  onClick={() => { if (lastSubmittedText) void submitRef.current(lastSubmittedText) }}
                >
                  Retry
                </button>
              )}
              <button className="wr-toast-close" onClick={() => dismiss(t.id)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
