'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useErrorToast } from '@/lib/writeright-toast'
import React from 'react'
import {
  Send,
  Mic,
  MicOff,
  Paperclip,
  ImagePlus,
  ArrowUpRight,
  SpellCheck2,
  Blend,
  FileText,
  Mail,
  MessageSquare,
  Linkedin,
  Globe,
  Copy,
  Check,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Share2,
  BookmarkPlus,
  Search,
  X,
  BarChart3,
  LayoutTemplate,
  Pencil,
  Download,
  ThumbsUp,
  ThumbsDown,
  Briefcase,
  Smile,
  Zap,
  GraduationCap,
  Target,
  ArrowRight,
} from 'lucide-react'
import {
  type Message,
  UserMessage,
  AIMessage,
} from '@/components/dashboard/ChatMessage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WritingMode = 'email' | 'paragraph' | 'linkedin' | 'whatsapp'
type ToneOption = 'Professional' | 'Friendly' | 'Concise' | 'Academic' | 'Assertive'
type VoiceLang = 'en-IN' | 'hi-IN' | 'en-US'
type OutputLang = 'en' | 'hindi' | 'tamil' | 'marathi' | 'bengali' | 'telugu'
type SidebarTab = 'chats' | 'templates'

interface AIQualityScores {
  clarity: number
  tone: number
  impact: number
  verdict: string
}

interface AIJobResult {
  improved_text: string
  english_version?: string | null
  teaching: {
    mistakes: string[]
    better_versions: string[]
    explanations: string[]
  }
  follow_up: string
  suggestions?: string[]
  scores?: AIQualityScores
  model: string
  prompt_tokens: number
  completion_tokens: number
}

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
}

interface ChatMessageRow {
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

const CAPABILITIES = [
  {
    title: 'Indian English fixer',
    desc: 'Detects "kindly revert", "do the needful", fixes automatically',
    Icon: SpellCheck2,
  },
  {
    title: 'Tone & clarity',
    desc: 'Shift between Professional, Friendly, Concise, Academic',
    Icon: Blend,
  },
  {
    title: 'Format for any context',
    desc: 'Emails, LinkedIn posts, WhatsApp, reports',
    Icon: FileText,
  },
]

const MODES: { id: WritingMode; label: string; Icon: React.ElementType; color: string }[] = [
  { id: 'email',     label: 'Email',               Icon: Mail,          color: '#3B82F6' },
  { id: 'paragraph', label: 'Paragraph',            Icon: MessageSquare, color: '#F59E0B' },
  { id: 'linkedin',  label: 'LinkedIn',             Icon: Linkedin,      color: '#0A66C2' },
  { id: 'whatsapp',  label: 'WhatsApp → Formal',    Icon: Globe,         color: '#25D366' },
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
    { title: 'Rewrite this paragraph', sub: 'More concise and impactful', full: 'Rewrite this paragraph to be more concise and impactful.' },
    { title: 'Fix grammar and flow', sub: 'Correct errors and improve readability', full: 'Fix grammar and flow, correct errors and improve readability.' },
    { title: 'Make this Academic', sub: 'Formal language for university', full: 'Make this academic with formal language suitable for university submission.' },
    { title: 'Simplify this text', sub: 'Plain English anyone can understand', full: 'Simplify this text into plain English anyone can understand.' },
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

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
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
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
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
  handlers?: StreamJobHandlers,
): Promise<AIJobResult> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`/api/writeright/job/${jobId}/stream`)

    const onAbort = () => {
      eventSource.close()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    eventSource.addEventListener('token', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data ?? '{}') as { chunk?: string }
        if (payload.chunk) handlers?.onToken?.(payload.chunk)
      } catch {
        // Ignore malformed token events.
      }
    })

    eventSource.addEventListener('result', (e) => {
      try {
        const data = JSON.parse(e.data) as { result?: AIJobResult }
        eventSource.close()
        signal.removeEventListener('abort', onAbort)
        if (data.result) resolve(data.result)
        else reject(new Error('Empty result'))
      } catch {
        eventSource.close()
        signal.removeEventListener('abort', onAbort)
        reject(new Error('Failed to parse result'))
      }
    })

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data ?? '{}') as { error?: string }
        eventSource.close()
        signal.removeEventListener('abort', onAbort)
        reject(new Error(data.error ?? 'Job failed'))
      } catch {
        eventSource.close()
        signal.removeEventListener('abort', onAbort)
        reject(new Error('Connection error'))
      }
    })

    eventSource.onerror = () => {
      eventSource.close()
      signal.removeEventListener('abort', onAbort)
      reject(new Error('Stream connection failed. Please try again.'))
    }
  })
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
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    if (!startTime) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  useEffect(() => {
    const cycle = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % THINKING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(cycle)
  }, [])

  return (
    <div className="chat-msg-ai">
      <div className="chat-msg-ai-header">
        <div className="chat-msg-ai-avatar" style={{ background: 'var(--mod-write)', color: 'var(--text-inv)', borderColor: 'var(--mod-write)' }}>
          ✍️
        </div>
        <span className="chat-msg-ai-label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="wr-brain-wave" aria-hidden="true">
            <svg viewBox="0 0 48 24" fill="none">
              <path d="M2 12 C8 4, 14 20, 20 12 S32 4, 38 12 S44 20, 46 12" />
              <path d="M2 12 C8 6, 14 18, 20 12 S32 6, 38 12 S44 18, 46 12" />
              <path d="M2 12 C8 8, 14 16, 20 12 S32 8, 38 12 S44 16, 46 12" />
            </svg>
          </span>
          <span style={{ color: 'var(--text-2)', fontSize: 12, fontStyle: 'italic', transition: 'opacity 300ms ease' }}>
            {THINKING_MESSAGES[msgIndex]}
          </span>
          {elapsed > 5 && (
            <span style={{ color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              Taking a bit longer... ({elapsed}s)
            </span>
          )}
        </span>
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

function ScoreCard({ scores, prevScores }: { scores?: AIQualityScores; prevScores?: AIQualityScores }) {
  if (!scores) return null

  const rows: Array<{ key: Exclude<keyof AIQualityScores, 'verdict'>; label: string }> = [
    { key: 'clarity', label: 'Clarity' },
    { key: 'tone', label: 'Tone' },
    { key: 'impact', label: 'Impact' },
  ]

  return (
    <div className="wr-score-card">
      <p className="wr-score-title">Quality Score</p>
      {rows.map((row) => {
        const rawValue = typeof scores[row.key] === 'number' ? scores[row.key] : 0
        const value = Math.max(1, Math.min(10, rawValue))
        const pct = `${value * 10}%`
        const fillColor = scoreColor(value)
        const prevRaw = prevScores ? (typeof prevScores[row.key] === 'number' ? prevScores[row.key] : 0) : null
        const prevValue = prevRaw !== null ? Math.max(1, Math.min(10, prevRaw)) : null
        const delta = prevValue !== null ? value - prevValue : 0

        return (
          <div className="wr-score-row" key={row.key}>
            <span className="wr-score-label">{row.label}</span>
            <div className="wr-score-track">
              <div
                className="wr-score-fill"
                style={
                  {
                    '--score-pct': pct,
                    '--score-delay': rows.indexOf(row),
                    background: fillColor,
                  } as React.CSSProperties
                }
              />
            </div>
            <span className="wr-score-num">
              <AnimatedNumber value={value} />
              {delta !== 0 && (
                <span className={`wr-score-delta${delta > 0 ? ' up' : ' down'}`}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </span>
          </div>
        )
      })}
      <div className="wr-verdict">
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
  followUp,
  suggestions,
  scores,
  prevScores,
  englishVersion,
  outputLang,
  streaming,
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
  followUp?: string
  suggestions?: string[]
  scores?: AIQualityScores
  prevScores?: AIQualityScores
  englishVersion?: string | null
  outputLang?: OutputLang
  streaming?: boolean
  jobId?: string | null
  chatId?: string | null
  mode?: WritingMode
  tone?: ToneOption
  onSuggest?: (text: string) => void
  onSaveTemplate?: () => void
  onShare?: () => void
}) {
  const [feedbackState, setFeedbackState] = useState<'none'|'up'|'down'>('none')
  const handleFeedback = useCallback(async (rating: 'up'|'down') => {
    if (feedbackState !== 'none') return  // locked after first vote
    setFeedbackState(rating)
    if (!jobId || !chatId) return
    try {
      await fetch('/api/writeright/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, chatId, rating, mode, tone })
      })
    } catch { /* ignore */ }
  }, [feedbackState, jobId, chatId, mode, tone])
  
  const [beforeExpanded, setBeforeExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showEnglish, setShowEnglish] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const isLong = before.length > 300

  const renderAfterText = showEnglish && englishVersion ? englishVersion : after

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(renderAfterText)
      } else {
        throw new Error('Clipboard API not available')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = renderAfterText
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
  const deltaStr = wordDelta === 0 ? '' : wordDelta > 0 ? `(+${wordDelta})` : `(${wordDelta})`
  const deltaColor = wordDelta <= 0 ? 'var(--success)' : 'var(--error)'
  const suggestionChips = (suggestions ?? []).map((chip) => chip.trim()).filter(Boolean).slice(0, 3)

  const beforeReadability = computeReadability(before)
  const afterReadability = computeReadability(renderAfterText)

  return (
    <div className="wr-diff-container">
      <div className="wr-diff-before">
        <div className="wr-diff-header">
          <span className="wr-diff-label" style={{ color: 'var(--error)' }}>Before</span>
        </div>
        <div className={`wr-diff-text${isLong && !beforeExpanded ? ' collapsed' : ''}`}>
          {before}
        </div>
        {isLong && (
          <button className="wr-diff-expand-btn" onClick={() => setBeforeExpanded((v) => !v)}>
            {beforeExpanded
              ? <><ChevronUp size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Show less</>
              : <><ChevronDown size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Show all ({before.length} chars)</>
            }
          </button>
        )}
      </div>

      <div className={`wr-diff-after${copied ? ' wr-just-copied' : ''}`}>
        <div className="wr-diff-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="wr-diff-label" style={{ color: 'var(--success)' }}>After</span>
            {!streaming && (
              <button
                className={`wr-diff-toggle${showDiff ? ' active' : ''}`}
                onClick={() => setShowDiff(!showDiff)}
                aria-pressed={showDiff}
                aria-label={showDiff ? 'Show clean version' : 'Show word diff'}
              >
                {showDiff ? 'Show clean' : 'Show diff'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {onSaveTemplate && (
              <button className="wr-copy-btn wr-template-save-btn" onClick={onSaveTemplate}>
                <BookmarkPlus size={11} /> Save
              </button>
            )}
            {onShare && (
              <button className="wr-copy-btn wr-share-btn" onClick={onShare}>
                <Share2 size={11} /> Share
              </button>
            )}
            <button className={`wr-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
        </div>
        <div className="wr-diff-text">
          {showDiff && !streaming ? (
            <DiffHighlight before={before} after={renderAfterText} />
          ) : (
            <>
              <AnimatedAfterText text={renderAfterText} animate={!streaming && !showDiff} />
              {streaming && <span className="wr-streaming-cursor" />}
            </>
          )}
        </div>
        <div className="wr-diff-meta">
          <span>{afterStats.words} words {deltaStr && <span style={{ color: deltaColor }}>{deltaStr}</span>}</span>
          <span>~{afterStats.readSecs}s read</span>
        </div>
        {!streaming && (
          <div className="wr-readability-row">
            <span className="wr-readability-label" style={{ background: 'transparent', color: 'var(--text-3)', padding: 0 }}>Readability:</span>
            <span className={`wr-readability-label ${beforeReadability.cls}`}>{beforeReadability.label} ({beforeReadability.score})</span>
            <span className="wr-readability-arrow-svg" aria-hidden="true">
              <ArrowRight size={12} />
            </span>
            <span className={`wr-readability-label ${afterReadability.cls}${afterReadability.score > beforeReadability.score ? ' wr-readability-improved' : ''}`}>
              {afterReadability.score < beforeReadability.score && <span title="Readability decreased" aria-label="Readability decreased">⚠️ </span>}
              {afterReadability.label} ({afterReadability.score})
            </span>
          </div>
        )}
        {englishVersion && outputLang && outputLang !== 'en' && !streaming && (
          <button className="wr-lang-toggle" onClick={() => setShowEnglish((prev) => !prev)}>
            {showEnglish ? 'Show translated version' : 'Show English version'}
          </button>
        )}
      </div>

      {!streaming && <ScoreCard scores={scores} prevScores={prevScores} />}

      {!streaming && (
        <div className="chat-insight" style={{ marginTop: 8 }}>
          <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>Why: </strong>
          {explanation}
        </div>
      )}

      {!streaming && teaching && teaching.mistakes.length > 0 && (
        <div className="wr-teaching">
          <p className="wr-teaching-title">What was changed &amp; why</p>
          {teaching.mistakes.map((mistake, i) => (
            <div
              key={`${mistake}-${i}`}
              className="wr-teaching-item"
              style={{ '--i': i } as React.CSSProperties}
            >
              <div className="wr-teaching-bullet">{i + 1}</div>
              <div>
                <p className="wr-teaching-mistake">{mistake}</p>
                {teaching.better_versions?.[i] && (
                  <p className="wr-teaching-better">
                    <span className="wr-teaching-better-label">Better:</span>
                    {`"${teaching.better_versions[i]}"`}
                  </p>
                )}
                {teaching.explanations?.[i] && (
                  <p className="wr-teaching-explanation">{teaching.explanations[i]}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!streaming && followUp && (
        <div className="wr-followup">
          <div className="wr-followup-icon">💡</div>
          <p className="wr-followup-text">{followUp}</p>
        </div>
      )}

      {!streaming && suggestionChips.length > 0 && (
        <div className="wr-suggestions">
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
      )}

      {!streaming && jobId && chatId && (
        <div className="wr-feedback-bar">
          <span style={{ flex: 1 }}>How was this result?</span>
          <button
            className={`wr-fb-btn ${feedbackState === 'up' ? 'active up' : ''}`}
            onClick={() => handleFeedback('up')}
            aria-label="This result was helpful"
            aria-pressed={feedbackState === 'up'}
            disabled={feedbackState !== 'none'}
          >
            <ThumbsUp size={12} strokeWidth={feedbackState === 'up' ? 3 : 2} />
          </button>
          <button
            className={`wr-fb-btn ${feedbackState === 'down' ? 'active down' : ''}`}
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
    <div className="wr-error-msg">
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
    <div className="wr-share-modal-overlay" onClick={onClose}>
      <div className="wr-share-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="wr-shortcuts-title" style={{ fontSize: 20, marginBottom: 12 }}>Save As Template</h3>
        <input
          className="wr-search-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Template name"
          autoFocus
        />
        <div className="wr-share-actions" style={{ marginTop: 14 }}>
          <button className="wr-rant-dismiss" onClick={onClose}>Cancel</button>
          <button
            className="wr-send-btn"
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
    canvas.width = 1080
    canvas.height = 1080
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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
    <div className="wr-share-modal-overlay" onClick={onClose}>
      <div className="wr-share-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="wr-shortcuts-title" style={{ fontSize: 20, marginBottom: 10 }}>Share Card</h3>
        <div className="wr-share-canvas-wrap">
          <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
        {shareUrl && (
          <div className="wr-followup" style={{ marginTop: 0 }}>
            <div className="wr-followup-icon">🔗</div>
            <p className="wr-followup-text" style={{ fontStyle: 'normal' }}>{shareUrl}</p>
          </div>
        )}
        <div className="wr-share-actions">
          <button className="wr-rant-dismiss" onClick={onClose}>Close</button>
          <button className="wr-rant-dismiss" onClick={downloadPng}>Download PNG</button>
          <button className="wr-rant-dismiss" onClick={() => void copyImage()}>Copy Image</button>
          <button className="wr-rant-dismiss" onClick={() => void createShareLink()} disabled={busy}>
            {busy ? 'Creating...' : 'Create Link'}
          </button>
          {shareUrl && (
            <button className="wr-send-btn" onClick={() => void copyShareLink()}>
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
    <div className="wr-shortcuts-overlay" onClick={onClose}>
      <div
        className="wr-shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <h3 className="wr-shortcuts-title">Keyboard Shortcuts</h3>
        {groups.map((group) => (
          <div key={group.label} className="wr-shortcuts-group">
            <p className="wr-shortcuts-group-label">{group.label}</p>
            {group.items.map((item) => (
              <div key={`${group.label}-${item.desc}`} className="wr-shortcut-row">
                <span className="wr-shortcut-desc">{item.desc}</span>
                <span className="wr-shortcut-keys">
                  {item.keys.map((keyPart) => (
                    <span key={`${item.desc}-${keyPart}`} className="wr-kbd">{keyPart}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
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
        <span><BarChart3 size={12} style={{ display: 'inline', marginRight: 6 }} /> Stats</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          {loading && <p className="wr-stat-label" style={{ marginTop: 6 }}>Loading stats…</p>}
          {!loading && stats && (
            <>
              <div className="wr-stats-grid">
                <div className="wr-stat-card">
                  <div className="wr-stat-val">{stats.streak.current}</div>
                  <div className="wr-stat-label">🔥 Days streak</div>
                </div>
                <div className="wr-stat-card">
                  <div className="wr-stat-val">{stats.total}</div>
                  <div className="wr-stat-label">📝 Improvements</div>
                </div>
                <div className="wr-stat-card">
                  <div className="wr-stat-val">{topMode ? `${topMode.mode}` : '—'}</div>
                  <div className="wr-stat-label">Favourite mode {topMode ? `(${topMode.percent}%)` : ''}</div>
                </div>
                <div className="wr-stat-card">
                  <div className="wr-stat-val">{topTone ? `${topTone.tone}` : '—'}</div>
                  <div className="wr-stat-label">Top tone {topTone ? `(${topTone.percent}%)` : ''}</div>
                </div>
              </div>
              <div className="wr-sparkline">
                {(stats.weekly_counts ?? []).map((count, idx) => {
                  const barH = `${Math.max(3, Math.round((count / maxWeek) * 28))}px`
                  return (
                    <div
                      key={`spark-${idx}`}
                      className="wr-sparkline-bar"
                      title={`${count} improvements`}
                      style={{ height: barH, '--i': idx, '--bar-h': barH } as React.CSSProperties}
                    />
                  )
                })}
              </div>
              <div className="wr-achievements">
                {stats.achievements.map((achievement) => {
                  const meta = ACHIEVEMENT_META[achievement] ?? { emoji: '⭐', label: achievement }
                  return (
                    <div key={achievement} className="wr-achievement">
                      {meta.emoji}
                      <div className="wr-achievement-tooltip">{meta.label}</div>
                    </div>
                  )
                })}
              </div>
              {writingProfile && writingProfile.top_mistakes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="wr-shortcuts-group-label" style={{ marginBottom: 4 }}>Your writing patterns</div>
                  <div className="wr-profile-tags">
                    {writingProfile.top_mistakes.map(m => (
                      <span key={m} className="wr-profile-tag">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {stats.avg_clarity_by_day && stats.avg_clarity_by_day.some(v => v > 0) && (
                <div>
                  <div className="wr-shortcuts-group-label" style={{ marginTop: 10, marginBottom: 4 }}>
                    Writing clarity trend
                  </div>
                  <div className="wr-sparkline wr-clarity-sparkline">
                    {stats.avg_clarity_by_day.map((score, idx) => {
                      const h = score > 0 ? `${Math.round((score / 10) * 28)}px` : '3px'
                      const color = score >= 8 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--bg-warm)'
                      return (
                        <div
                          key={idx}
                          className="wr-sparkline-bar"
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
        </>
      )}
    </div>
  )
}

function TemplatesDrawer({
  open,
  templates,
  onClose,
  onUse,
  onDelete,
  onRename,
}: {
  open: boolean
  templates: TemplateRow[]
  onClose: () => void
  onUse: (template: TemplateRow) => void
  onDelete: (templateId: string) => void
  onRename: (templateId: string, nextName: string) => void
}) {
  const grouped = templates.reduce<Record<WritingMode, TemplateRow[]>>(
    (acc, item) => {
      acc[item.mode] = [...acc[item.mode], item]
      return acc
    },
    { email: [], paragraph: [], linkedin: [], whatsapp: [] },
  )

  return (
    <div className={`wr-drawer${open ? ' open' : ''}`}>
      <div className="wr-drawer-header">
        <span style={{ fontWeight: 600 }}>Templates</span>
        <button className="wr-rant-dismiss" onClick={onClose}>Close</button>
      </div>
      {(['email', 'paragraph', 'linkedin', 'whatsapp'] as const).map((mode) => (
        <div key={mode}>
          <p className="wr-shortcuts-group-label" style={{ margin: '10px 12px 4px' }}>{mode}</p>
          {grouped[mode].map((template) => (
            <div key={template.id} className="wr-template-item" onClick={() => onUse(template)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <p className="wr-template-name">{template.name}</p>
                <span className="wr-use-badge">{template.use_count} uses</span>
              </div>
              <p className="wr-template-meta">{template.tone} • {template.content.slice(0, 70)}{template.content.length > 70 ? '…' : ''}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  className="wr-rant-dismiss"
                  onClick={(e) => {
                    e.stopPropagation()
                    const renamed = window.prompt('Rename template', template.name)
                    if (renamed && renamed.trim()) onRename(template.id, renamed.trim())
                  }}
                >
                  <Pencil size={11} /> Rename
                </button>
                <button
                  className="wr-rant-dismiss"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(template.id)
                  }}
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

function computeWordDiff(before: string, after: string): Array<{type: 'eq'|'del'|'ins', text: string}> {
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

  const result: Array<{type: 'eq'|'del'|'ins', text: string}> = [];
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

function DiffHighlight({ before, after }: { before: string; after: string }) {
  const diffs = useMemo(
    () => (before.length <= 2000 && after.length <= 2000)
      ? computeWordDiff(before, after)
      : [{ type: 'ins' as const, text: after }],
    [before, after]
  );
  return (
    <>
      {diffs.map((d, i) => {
        if (d.type === 'eq') return <span key={i}>{d.text}</span>;
        if (d.type === 'del') return <span key={i} className="wr-diff-del">{d.text}</span>;
        if (d.type === 'ins') return <span key={i} className="wr-diff-ins">{d.text}</span>;
        return null;
      })}
    </>
  );
}

function VersionTimeline({
  open,
  versions,
  onClose,
  onRestore,
}: {
  open: boolean
  versions: Array<{ versionNum: number; timestamp: number; words: number; text: string }>
  onClose: () => void
  onRestore: (text: string) => void
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRestoreClick = useCallback((v: { versionNum: number; text: string }) => {
    if (confirmId === v.versionNum) {
      // Second click — confirm restore
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirmId(null)
      onRestore(v.text)
    } else {
      // First click — enter confirm mode
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirmId(v.versionNum)
      confirmTimerRef.current = setTimeout(() => setConfirmId(null), 3000)
    }
  }, [confirmId, onRestore])

  useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }, [])

  return (
    <div
      className={`wr-version-panel${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      aria-hidden={!open}
    >
      <div className="wr-drawer-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>Version History</span>
        <button className="wr-rant-dismiss" onClick={onClose}>Close</button>
      </div>
      <div>
        {versions.map((v) => (
          <div key={v.versionNum} className="wr-version-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="wr-version-num">Version {v.versionNum}</span>
              <span className="wr-version-meta">{v.words} words</span>
            </div>
            <div className="wr-version-meta">
              {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="wr-version-preview" style={{ marginTop: 6, marginBottom: 10 }}>
              {v.text.slice(0, 60)}{v.text.length > 60 ? '…' : ''}
            </div>
            <button
              className={`wr-rant-dismiss${confirmId === v.versionNum ? ' wr-restore-confirm-btn' : ''}`}
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleRestoreClick(v)}
              aria-label={confirmId === v.versionNum ? 'Click again to confirm restore' : 'Restore this version'}
            >
              {confirmId === v.versionNum ? 'Confirm restore?' : 'Restore this version'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
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

// ── NEW: [INPUT-4] Smart Quick Actions Bar ──
function QuickActionsBar({ text, onAction }: { text: string; onAction: (prompt: string) => void }) {
  const chips = useMemo(() => {
    const result: Array<{ label: string; prompt: string }> = []
    if (!text.trim() || text.length < 10) return result
    if (/\?/.test(text)) result.push({ label: 'Make this a clear question', prompt: text })
    if (text.split(/[.!?]+/).filter(s => s.trim()).length >= 3) result.push({ label: 'TL;DR this', prompt: text })
    if (/[!]{2,}|[A-Z]{3,}/.test(text)) result.push({ label: 'Cool this down', prompt: text })
    if (text.length > 200) result.push({ label: 'Tighten to 50 words', prompt: text })
    return result.slice(0, 4)
  }, [text])
  if (chips.length === 0) return null
  return (
    <div className="wr-quick-actions">
      {chips.map((c, i) => (
        <button key={i} className="wr-quick-chip" onClick={() => onAction(c.prompt)} type="button" aria-label={c.label}>
          {c.label}
        </button>
      ))}
    </div>
  )
}



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

// ── NEW: [LOOP-2] Daily Goal Ring SVG ──
function DailyGoalRing({ current, goal }: { current: number; goal: number }) {
  const pct = Math.min(current / goal, 1)
  const circumference = 2 * Math.PI * 14
  const offset = circumference * (1 - pct)
  return (
    <svg className="wr-goal-ring" viewBox="0 0 36 36" aria-label={`${current} of ${goal} daily goal`}>
      <circle className="wr-goal-ring-bg" cx="18" cy="18" r="14" />
      <circle
        className="wr-goal-ring-fill"
        cx="18" cy="18" r="14"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fill="var(--text-1)" fontSize="10" fontWeight="600">
        {current}
      </text>
    </svg>
  )
}

const MILESTONES: Record<number, string> = { 5: '🏆 5 texts improved! You\u2019re warming up.', 10: '⚡ 10x writer! Building momentum.', 25: '🔥 25 improvements — you\u2019re on fire!', 50: '👑 50 texts! Writing mastery unlocked.' }


export default function WriteRightPage() {
  const { toasts, dismiss, showError } = useErrorToast()
  const [input, setInput] = useState('')
  const [tone, setTone] = useState<ToneOption>('Professional')
  const [intensity, setIntensity] = useState(3)
  const [mode, setMode] = useState<WritingMode>('email')
  const [outputLang, setOutputLang] = useState<OutputLang>('en')
  const [messages, setMessages] = useState<(Message & { jobResult?: AIJobResult; timestamp?: number })[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [lastSubmittedText, setLastSubmittedText] = useState<string | null>(null)
  const [lastImprovedText, setLastImprovedText] = useState('')
  const [lastResultMeta, setLastResultMeta] = useState<{ mode: WritingMode; tone: ToneOption; chatId: string; jobId: string } | null>(null)

  const [chats, setChats] = useState<ChatListItem[]>([])
  
  const [writingProfile, setWritingProfile] = useState<{ top_mistakes: string[], improvement_count: number } | null>(null)
  
  
  // Draft Auto-save
  useEffect(() => {
    if (chatId && input) {
      const t = setTimeout(() => localStorage.setItem(`wr:draft:${chatId}`, input), 2000)
      return () => clearTimeout(t)
    }
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
    } catch {}
  }, [])

  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault(); void submitRef.current();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault(); if (lastImprovedText) navigator.clipboard.writeText(lastImprovedText);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); document.querySelector<HTMLInputElement>('.wr-search-input')?.focus();
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
  const [challengeDone, setChallengeDone] = useState(() => {
    try { return localStorage.getItem('wr:c:' + todayKey) === '1' }
    catch { return false }
  })
  const [challengeDismissed, setChallengeDismissed] = useState(() => {
    try { return localStorage.getItem('wr:cd:' + todayKey) === '1' }
    catch { return false }
  })

  // ENHANCE-04: Writing momentum indicator
  const [sessionCount, setSessionCount] = useState(0)

  // ENHANCE-06: Keyboard shortcut discovery toast
  const [showShortcutTip, setShowShortcutTip] = useState(false)

  const momentumMsg = useMemo(() => {
    if (sessionCount === 0) return null
    if (sessionCount === 1) return '1 text improved today'
    if (sessionCount < 4) return `${sessionCount} texts improved`
    return `${sessionCount} on a roll 🔥`
  }, [sessionCount])

  // GAME-1: Achievement milestone banner
  const [achievementBanner, setAchievementBanner] = useState<string | null>(null)
  useEffect(() => {
    if (sessionCount > 0 && MILESTONES[sessionCount]) {
      setAchievementBanner(MILESTONES[sessionCount])
      const t = setTimeout(() => setAchievementBanner(null), 5000)
      return () => clearTimeout(t)
    }
  }, [sessionCount])

  // F-11: Prompt Builder
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderObj, setBuilderObj] = useState({ audience: '', purpose: '', points: '' })

  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const aiVersions = useMemo(() => {
    return messages
      .filter((m) => m.role === 'ai' && typeof m.jobResult === 'object')
      .map((m, idx) => {
        const text = m.jobResult?.improved_text || ''
        return {
          versionNum: idx + 1,
          timestamp: m.timestamp || Date.now(),
          words: textStats(text).words,
          text,
        }
      })
      .reverse()
  }, [messages])

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chats')
  const [templatesDrawerOpen, setTemplatesDrawerOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const { loading: searchLoading, results: searchResults } = useWriterightSearch(searchQuery, sidebarTab === 'chats')

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

  const [fileBadge, setFileBadge] = useState<{ name: string; loading: boolean } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadingStartRef = useRef<number | null>(null)
  const submitRef = useRef<(text?: string, forcedTone?: ToneOption) => Promise<void>>(async () => {})

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
      const res = await apiGet<ListChatsResponse>('/api/writeright/chat')
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
      setSidebarTab('templates')
      setTemplatesDrawerOpen(true)
      setSaveModalOpen(false)
    } catch (err) {
      console.error('Failed to save template', err)
    }
  }, [createTemplate, saveTemplatePayload])

  const openShareModal = useCallback((payload: SharePayload) => {
    setSharePayload(payload)
    setShareModalOpen(true)
  }, [])

  // renderAiBlock creates JSX stored in messages[].content.
  // Its deps (openSaveTemplateModal, openShareModal) are stable useCallbacks
  // with empty dep arrays, so identity changes only happen on first render.
  // Do not add unstable deps here without auditing all callers.
  const renderAiBlock = useCallback((opts: {
    before: string
    result: AIJobResult
    jobId?: string | null
    chatId?: string | null
    mode: WritingMode
    tone: ToneOption
    outputLang: OutputLang
    prevScores?: AIQualityScores
  }) => {
    const { before, result, jobId, chatId: chatIdArg, mode: blockMode, tone: blockTone, outputLang: blockOutputLang, prevScores: blockPrevScores } = opts
    const explanationParts: string[] = []
    if (result.teaching?.mistakes?.length > 0) {
      explanationParts.push(result.teaching.mistakes[0])
      if (result.teaching.explanations?.length > 0) {
        explanationParts.push(result.teaching.explanations[0])
      }
    }
    const explanation = explanationParts.join(' — ') || 'AI-improved version of your text.'

    return (
      <WriteDiffBlock
        before={before}
        after={result.improved_text}
        explanation={explanation}
        teaching={result.teaching}
        followUp={result.follow_up}
        suggestions={result.suggestions}
        scores={result.scores}
        prevScores={blockPrevScores}
        englishVersion={result.english_version}
        outputLang={blockOutputLang}
        jobId={jobId ?? undefined}
        chatId={chatIdArg ?? undefined}
        mode={blockMode}
        tone={blockTone}
        onSuggest={(suggestion) => { void submitRef.current(suggestion) }}
        onSaveTemplate={() => openSaveTemplateModal(result.improved_text, blockMode, blockTone)}
        onShare={jobId && chatIdArg ? () => openShareModal({
          before,
          after: result.improved_text,
          mode: blockMode,
          tone: blockTone,
          chatId: chatIdArg,
          jobId,
        }) : undefined}
      />
    )
  }, [openSaveTemplateModal, openShareModal])

  const handleModeChange = useCallback((newMode: WritingMode) => {
    if (newMode === mode && !chatId) return
    const wasStarted = hasStarted || chatId !== null
    setMode(newMode)
    setChatId(null)
    setMessages([])
    setHasStarted(false)
    setStreamingText('')
    setStreamingBefore('')
    setRantDismissed(false)   // reset so rant banner can reappear in new mode
    if (wasStarted) {
      const modeLabel = MODES.find((m) => m.id === newMode)?.label ?? newMode
      setMessages([{
        role: 'ai',
        content: <div className="wr-mode-divider">Switched to {modeLabel} mode</div>,
      }])
      setHasStarted(true)
    }
  }, [chatId, hasStarted, mode])

  const selectChat = useCallback(async (id: string, chatMode: string) => {
    try {
      setMode(chatMode as WritingMode)
      setChatId(id)
      const res = await apiGet<{ messages: ChatMessageRow[] }>(`/api/writeright/chat/${id}/messages`)
      let latestImproved = ''
      let latestJob: string | null = null

      const reconstructed: Message[] = res.messages.map((m) => {
        if (m.role === 'user') {
          return { role: 'user', content: m.content }
        }

        try {
          const parsed = JSON.parse(m.content) as AIJobResult
          latestImproved = typeof parsed.improved_text === 'string' ? parsed.improved_text : latestImproved
          const metadata = (m.metadata ?? {}) as Record<string, unknown>
          const jobId = typeof metadata.job_id === 'string' ? metadata.job_id : null
          latestJob = jobId ?? latestJob
          const savedMode = (typeof metadata.mode === 'string' ? metadata.mode : chatMode) as WritingMode
          const savedTone = (typeof metadata.tone === 'string' ? metadata.tone : tone) as ToneOption
          const savedOutputLang = (typeof metadata.output_language === 'string' ? metadata.output_language : 'en') as OutputLang
          return {
            role: 'ai',
            jobResult: parsed,
            timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
            content: renderAiBlock({
              before: 'Previous draft (context collapsed)',
              result: parsed,
              jobId,
              chatId: id,
              mode: savedMode,
              tone: savedTone,
              outputLang: savedOutputLang,
            }),
          }
        } catch {
          return { role: 'ai', content: m.content }
        }
      })

      setMessages(reconstructed)
      if (latestImproved) setLastImprovedText(latestImproved)
      setHasStarted(true)
      setSearchQuery('')
      scrollBottom()
    } catch (err) {
      console.error('Failed to load chat messages', err)
    }
  }, [renderAiBlock, scrollBottom, tone])

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
      const res = await fetch('/api/writeright/export')
      const data = await res.json() as { chats?: ExportChat[] }
      
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
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
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
      })

      let result: AIJobResult
      let resolvedJobId: string | null = null

      if (submitRes.status === 'completed' && submitRes.jobId === 'cached') {
        result = submitRes.result
      } else {
        resolvedJobId = submitRes.jobId
        result = await streamJobResult(submitRes.jobId, controller.signal, {
          onToken: (chunk) => {
            setStreamingText((prev) => `${prev}${chunk}`)
          },
        })
      }

      // ENHANCE-02: Extract prevScores from previous AI message for delta
      const prevAiMsg = [...messages].reverse().find(m => m.role === 'ai' && m.jobResult?.scores)
      const prevScores = prevAiMsg?.jobResult?.scores ?? undefined

      const aiContent = renderAiBlock({
        before: msg,
        result,
        jobId: resolvedJobId,
        chatId: activeChatId,
        mode,
        tone: toneToUse,
        outputLang: submitOutputLang,
        prevScores,
      })

      setLastImprovedText(result.improved_text); localStorage.removeItem(`wr:draft:${activeChatId}`)
      if (activeChatId && resolvedJobId) {
        setLastResultMeta({ mode, tone: toneToUse, chatId: activeChatId, jobId: resolvedJobId })
      }
      setMessages((prev) => [...prev, {
        role: 'ai',
        jobResult: result,
        timestamp: Date.now(),
        content: aiContent
      }])
      setStreamingText('')
      setStreamingBefore('')
      scrollBottom()
      void loadChats()

      // ENHANCE-04: Increment session momentum
      setSessionCount(prev => prev + 1)

      // ENHANCE-06: Trigger shortcut tip after 3rd improvement
      if (sessionCount === 2) {
        try {
          const dismissed = localStorage.getItem('wr:shortcut-tip')
          if (!dismissed) setShowShortcutTip(true)
        } catch {}
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — add a subtle divider so they know it stopped
        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            content: (
              <div className="wr-mode-divider" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Cancelled
              </div>
            ),
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
        role: 'ai',
        content: (
          <InlineError
            message={errorMessage}
            onRetry={() => {
              setMessages((items) => items.slice(0, -1))
              void submitRef.current(retryText)
            }}
          />
        ),
      }])
      scrollBottom()
    } finally {
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
    lastSubmittedText,
    loadChats,
    loading,
    messages,
    mode,
    outputLang,
    renderAiBlock,
    scrollBottom,
    sessionCount,
    stopRecording,
    tone,
    showError,
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
      const meta = e.ctrlKey || e.metaKey
      const activeElement = document.activeElement
      const inTextArea = activeElement === taRef.current
      const inEditable =
        inTextArea ||
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)

      if (e.key === 'Escape') {
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

  const sidebarVisible = chats.length > 0 || templates.length > 0 || hasStarted

  return (
    <div className={`chat-workspace ${sidebarVisible ? 'wr-workspace-with-sidebar' : ''}`} data-module="write">
      {/* GAME-1: Achievement milestone banner */}
      {achievementBanner && (
        <div className="wr-achievement-banner" role="status">
          {achievementBanner}
          <button className="wr-achievement-banner-dismiss" onClick={() => setAchievementBanner(null)}>×</button>
        </div>
      )}
      {sidebarVisible && (
        <div className="wr-sidebar">
          <div className="wr-sidebar-header">
            <div className="wr-sidebar-brand">
              <span className="wr-sidebar-brand-icon">✦</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }}>WriteRight</span>
            </div>
            {stats && stats.streak.current >= 1 && (
              <div className="wr-streak-badge">
                🔥 {stats.streak.current}-day streak
              </div>
            )}
            {(!stats || stats.streak.current === 0) && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', cursor: 'pointer' }}
                onClick={() => { setInput(`Challenge: ${todayChallenge.desc}`); taRef.current?.focus() }}
              >
                Start your streak →
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="wr-sidebar-new" style={{ flex: 1 }} onClick={() => handleModeChange('email')}>
                <Plus size={14} /> New Chat
              </button>
              <button className="wr-sidebar-new" style={{ width: 'auto', padding: '0 12px' }} onClick={handleExport} disabled={isExporting}>
                {isExporting ? '...' : <Download size={14} />}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button
                className={`wr-mode-btn${sidebarTab === 'chats' ? ' active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setSidebarTab('chats')}
              >
                Chats
              </button>
              <button
                className={`wr-mode-btn${sidebarTab === 'templates' ? ' active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  setSidebarTab('templates')
                  setTemplatesDrawerOpen(true)
                }}
              >
                <LayoutTemplate size={12} /> Templates
              </button>
            </div>
          </div>

          {sidebarTab === 'chats' && (
            <div className="wr-search-bar">
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-3)' }} />
                <input
                  className="wr-search-input"
                  placeholder="Search history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 32, paddingRight: 30 }}
                />
                {searchQuery.trim() && (
                  <button
                    className="wr-file-badge-remove"
                    style={{ position: 'absolute', right: 10, top: 8 }}
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="wr-sidebar-list">
            {sidebarTab === 'chats' && searchQuery.trim() && (
              <>
                {searchLoading && <p className="wr-template-meta" style={{ padding: '8px 10px' }}>Searching…</p>}
                {!searchLoading && searchResults.length === 0 && (
                  <p className="wr-template-meta" style={{ padding: '8px 10px' }}>No matching chats.</p>
                )}
                {!searchLoading && searchResults.map((result) => (
                  <div
                    key={result.chatId}
                    className="wr-search-result"
                    onClick={() => { void selectChat(result.chatId, result.mode) }}
                  >
                    <div className="wr-sidebar-item-title">{highlightText(result.chatTitle, searchQuery)}</div>
                    <div className="wr-search-snippet">{highlightText(result.messageSnippet, searchQuery)}</div>
                  </div>
                ))}
              </>
            )}

            {sidebarTab === 'chats' && !searchQuery.trim() && chats.map((c) => (
              <div
                key={c.id}
                className={`wr-sidebar-item${chatId === c.id ? ' active' : ''}`}
                data-mode={c.mode}
                onClick={() => { void selectChat(c.id, c.mode) }}
              >
                <div className="wr-sidebar-item-title">{c.title || 'New Conversation'}</div>
                <div className="wr-sidebar-item-meta">
                  <span className="wr-sidebar-mode">{c.mode}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {c.message_count > 0 && (
                      <span className="wr-msg-count">{c.message_count}</span>
                    )}
                    <span className="wr-sidebar-time">
                      {new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <button className="wr-sidebar-del" onClick={(e) => { void deleteChat(e, c.id) }} aria-label="Delete chat">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {sidebarTab === 'templates' && templates.map((template) => (
              <div
                key={template.id}
                className="wr-sidebar-item"
                data-mode={template.mode}
                onClick={() => {
                  setInput(template.content.slice(0, CHAR_MAX))
                  setMode(template.mode)
                  setTone(template.tone)
                  void markUsed(template.id)
                  taRef.current?.focus()
                }}
              >
                <div className="wr-sidebar-item-title">{template.name}</div>
                <div className="wr-sidebar-item-meta">
                  <span className="wr-sidebar-mode">{template.mode}</span>
                  <span className="wr-use-badge">{template.use_count}</span>
                </div>
              </div>
            ))}
          </div>
          {sidebarTab === 'chats' && !searchQuery.trim() && chats.length === 1 && (
            <div className="wr-sidebar-onboard">
              <p>📂 Your history is saved here.</p>
              <p>Each chat is a writing session you can revisit.</p>
            </div>
          )}

          <StatsPanel
            open={statsOpen}
            loading={statsLoading}
            stats={stats}
            writingProfile={writingProfile}
            onToggle={() => setStatsOpen((prev) => !prev)}
          />
        </div>
      )}

      <div className={sidebarVisible ? 'wr-workspace-main' : ''} style={{ flex: 1, position: 'relative' }}>
        <VersionTimeline
          open={versionPanelOpen}
          versions={aiVersions}
          onClose={() => setVersionPanelOpen(false)}
          onRestore={(text) => {
            setInput(text)
            setVersionPanelOpen(false)
            taRef.current?.focus()
          }}
        />
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-scroll-inner">
            {!hasStarted && (
              <div className="chat-empty">
                <div className="wr-module-orb" aria-hidden="true">
                  <span className="wr-module-orb-inner">✍️</span>
                </div>
                <h1 className="wr-hero-title">WriteRight</h1>
                <p className="wr-hero-tagline">Write like you mean it.</p>
                
                {!challengeDismissed && (
                <div className={`wr-daily-chip${challengeDone ? ' done' : ''}`}>
                  <div style={{ fontSize: 22 }}>{challengeDone ? '✅' : '✨'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>Daily Challenge: {todayChallenge.title}</h4>
                    <p>{todayChallenge.desc}</p>
                    {!challengeDone && (
                      <button
                        className="wr-daily-accept-btn"
                        onClick={() => {
                          setInput(`Challenge: ${todayChallenge.desc}`)
                          setChallengeDone(true)
                          try { localStorage.setItem('wr:c:' + todayKey, '1') } catch {}
                        }}
                      >
                        Accept challenge →
                      </button>
                    )}
                    {challengeDone && (
                      <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                        ✓ Done for today!
                      </span>
                    )}
                  </div>
                  <button
                    className="wr-daily-dismiss-btn"
                    aria-label="Dismiss daily challenge"
                    onClick={() => {
                      setChallengeDismissed(true)
                      try { localStorage.setItem('wr:cd:' + todayKey, '1') } catch {}
                    }}
                  >
                    ×
                  </button>
                </div>
                )}

                <div className="chat-caps-grid">
                  {CAPABILITIES.map((c) => (
                    <div key={c.title} className="chat-cap-card">
                      <div className="chat-cap-icon"><c.Icon size={15} strokeWidth={1.8} /></div>
                      <p className="chat-cap-title">{c.title}</p>
                      <p className="chat-cap-desc">{c.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="wr-mode-bar">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      className={`wr-mode-btn${mode === m.id ? ' active' : ''}`}
                      onClick={() => handleModeChange(m.id)}
                    >
                      <m.Icon size={13} style={{ color: mode === m.id ? m.color : undefined }} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="chat-prompts-grid">
                  {[...MODE_PROMPTS[mode]].sort((a,b) => (chipCounts[b.title] || 0) - (chipCounts[a.title] || 0)).map((p) => {
                    const isNew = (chipCounts[p.title] || 0) === 0
                    return (
                    <button
                      key={p.title}
                      className="chat-prompt-chip"
                      onClick={(e) => {
                        // Ripple effect
                        const btn = e.currentTarget
                        const rect = btn.getBoundingClientRect()
                        const dot = document.createElement('span')
                        dot.className = 'wr-chip-ripple-dot'
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
                      <span className="chat-prompt-chip-title" style={{ position: 'relative' }}>
                        {p.title}
                        {isNew && <span className="wr-new-dot" aria-hidden="true" />}
                        <ArrowUpRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      </span>
                      <span className="chat-prompt-chip-sub">{p.sub}</span>
                    </button>
                  )})}
                </div>
              </div>
            )}

            {hasStarted && (
              <div className="chat-messages">
                {messages.map((m, i) => {
                  const isLastAi = m.role === 'ai' && i === messages.map((msg) => msg.role).lastIndexOf('ai')
                  return (
                    <React.Fragment key={i}>
                      {isLastAi && aiVersions.length >= 2 && (
                        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 12px' }}>
                          <button
                            className="wr-version-btn"
                            onClick={() => setVersionPanelOpen(true)}
                          >
                            <RefreshCcw size={11} /> Version history ({aiVersions.length})
                          </button>
                        </div>
                      )}
                      {m.role === 'user'
                        ? <UserMessage content={m.content} />
                        : <AIMessage content={m.content} emoji="✍️" moduleColor="var(--mod-write)" />
                      }
                    </React.Fragment>
                  )
                })}

                {loading && !streamingText && <WriteRightThinking startTime={loadingStartRef.current} />}

                {loading && streamingText && (
                  <AIMessage
                    content={(
                      <WriteDiffBlock
                        before={streamingBefore || (lastSubmittedText ?? 'Your draft')}
                        after={streamingText}
                        explanation="Streaming response..."
                        outputLang={outputLang}
                        streaming
                      />
                    )}
                    emoji="✍️"
                    moduleColor="var(--mod-write)"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="chat-input-bar">
          {loading && (
            <div className="wr-progress-bar" aria-hidden="true">
              <div className="wr-progress-fill" />
            </div>
          )}
          <div className="chat-input-bar-inner">
            {hasStarted && (
              <div className="wr-mode-bar" style={{ marginBottom: 8 }}>
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`wr-mode-btn${mode === m.id ? ' active' : ''}`}
                    onClick={() => handleModeChange(m.id)}
                    style={{ fontSize: 12, padding: '5px 12px' }}
                  >
                    <m.Icon size={12} style={{ color: mode === m.id ? m.color : undefined }} />
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <div className="wr-tone-bar">
              <span className="wr-tone-label">Tone:</span>
              {TONES.map((t) => {
                const ToneIcon = {
                  Professional: Briefcase,
                  Friendly: Smile,
                  Concise: Zap,
                  Academic: GraduationCap,
                  Assertive: Target,
                }[t]
                return (
                  <div key={t} className="wr-tone-tooltip-wrap">
                    <button className={`tone-pill${tone === t ? ' active' : ''}`} onClick={() => setTone(t)}>
                      {ToneIcon && <span className="wr-tone-pill-icon"><ToneIcon size={10} /></span>}
                      {t}
                    </button>
                    <div className="wr-tone-tooltip">{TONE_DESCRIPTIONS[t]}</div>
                    <TonePreviewTooltip text={input} tone={t} />
                  </div>
                )
              })}
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
            </div>

            <div className="wr-intensity-row">
              <span className="wr-intensity-label">Rewrite Intensity:</span>
              <input
                type="range"
                className="wr-intensity-slider"
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
              <span className="wr-intensity-value">
                {intensity === 1 ? '1. Preserve style' :
                 intensity === 2 ? '2. Light touch' :
                 intensity === 3 ? '3. Standard' :
                 intensity === 4 ? '4. Improve actively' :
                 '5. Full rewrite'}
              </span>
            </div>

            {shouldShowRantBanner && (
              <div className="wr-rant-banner" role="alert">
                <div className="wr-rant-body">
                  <p className="wr-rant-headline">😤 Looks like you&apos;re venting.</p>
                  <p className="wr-rant-subtitle">Send anyway, or let us cool this down to a professional tone?</p>
                </div>
                <div className="wr-rant-actions-row">
                  <button type="button" className="wr-rant-dismiss" onClick={() => setRantDismissed(true)}>
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
              </div>
            )}

            {fileBadge && (
              <div className="wr-file-badge">
                <span>{fileBadge.loading ? `Extracting ${fileBadge.name}…` : fileBadge.name}</span>
                <button className="wr-file-badge-remove" onClick={() => setFileBadge(null)} aria-label="Remove file badge">
                  <X size={12} />
                </button>
              </div>
            )}

            {fileError && (
              <div className="wr-error-msg" style={{ marginBottom: 8 }}>
                <span>{fileError}</span>
              </div>
            )}

            {/* NEW: [INPUT-4] Smart Quick Actions */}
            <QuickActionsBar text={input} onAction={(prompt) => { void submitRef.current(prompt) }} />

            {/* NEW: [LOOP-2/3] Momentum + Goal Ring */}
            {sessionCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <DailyGoalRing current={sessionCount} goal={5} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="wr-momentum-badge">
                    {sessionCount < 5 ? `${sessionCount}/5 daily goal` : `${sessionCount} on a roll 🔥`}
                  </span>
                  {momentumMsg && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{momentumMsg}</span>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
              <button 
                type="button" 
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 11, padding: '4px 8px', borderRadius: 16, color: 'var(--text-2)', cursor: 'pointer' }}
                onClick={() => setBuilderOpen(!builderOpen)}
              >
                {builderOpen ? 'Close Builder' : '✨ Prompt Builder'}
              </button>
            </div>

            {builderOpen && (
              <div className="wr-builder-panel">
                <p className="wr-builder-heading">✨ Prompt Builder</p>
                <input
                  className="wr-builder-field"
                  placeholder="Target Audience (e.g., Engineers, Clients)"
                  value={builderObj.audience}
                  onChange={(e) => setBuilderObj({ ...builderObj, audience: e.target.value })}
                />
                <input
                  className="wr-builder-field"
                  placeholder="Primary Purpose (e.g., Persuade, Inform)"
                  value={builderObj.purpose}
                  onChange={(e) => setBuilderObj({ ...builderObj, purpose: e.target.value })}
                />
                <input
                  className="wr-builder-field full"
                  placeholder="Key Points (comma separated)"
                  value={builderObj.points}
                  onChange={(e) => setBuilderObj({ ...builderObj, points: e.target.value })}
                />
                <button
                  type="button"
                  style={{ gridColumn: 'span 2', background: 'var(--mod-write)', color: '#fff', border: 'none', padding: '6px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
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
                  Build & Fill
                </button>
              </div>
            )}

            <div className="chat-input-box">
              <textarea
                ref={taRef}
                className="chat-textarea"
                placeholder={MODE_PLACEHOLDERS[mode]}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = `${Math.min(t.scrollHeight, 320)}px`
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void submitRef.current()
                  }
                }}
                rows={3}
                maxLength={CHAR_MAX}
                style={{ padding: '16px 20px', minHeight: '80px' }}
              />

              {charDisplay && (
                <p className={`wr-char-count${charClass ? ` ${charClass}` : ''}`}>
                  {charDisplay}
                </p>
              )}

              <div className="chat-input-footer">
                <div className="chat-tools-left">
                  {voiceSupported && (
                    <>
                      <button
                        type="button"
                        className="chat-tool-btn"
                        aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                        aria-pressed={isRecording}
                        onClick={toggleRecording}
                      >
                        {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>
                      <button
                        type="button"
                        className="wr-lang-pill"
                        onClick={cycleVoiceLang}
                        aria-label="Change voice input language"
                      >
                        {VOICE_LANGS.find((lang) => lang.id === voiceLang)?.label ?? 'AUTO'}
                      </button>
                    </>
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

                  <button className="chat-tool-btn" aria-label="Attach file" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip size={16} />
                  </button>
                  <button
                    className="chat-tool-btn"
                    aria-label="Paste or attach image (coming soon)"
                    title="Image input — coming soon"
                    onClick={() => {
                      const btn = document.activeElement as HTMLButtonElement
                      if (btn) {
                        btn.setAttribute('data-tooltip', 'Coming soon!')
                        setTimeout(() => btn.removeAttribute('data-tooltip'), 2000)
                      }
                    }}
                    style={{ opacity: 0.45, cursor: 'default' }}
                  >
                    <ImagePlus size={16} />
                  </button>

                  {isRecording && (
                    <div className="wr-recording-indicator" aria-live="polite">
                      <span className="wr-recording-dot" />
                      Recording
                    </div>
                  )}
                </div>

                <div className="chat-tools-right">
                  <button
                    type="button"
                    className="wr-shortcut-btn"
                    aria-label="Keyboard Shortcuts"
                    onClick={() => setShowShortcutsModal(true)}
                  >
                    ?
                    <div className="wr-shortcut-hint">
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
                  <button
                    className="wr-send-btn"
                    onClick={() => { void submitRef.current() }}
                    disabled={!input.trim() || loading}
                    aria-label="Improve text"
                  >
                    {loading
                      ? <>{[0, 1, 2].map((i) => <span key={i} className="dot-thinking" style={{ animationDelay: `${i * 0.2}s` }} />)}</>
                      : hasStarted && messages.some(m => m.role === 'ai') && input.trim().length < 100 && !input.trim().includes('\n')
                        ? <><RefreshCcw size={13} strokeWidth={2.2} /> Refine</>
                        : <><Send size={13} strokeWidth={2.2} /> Improve</>
                    }
                  </button>
                </div>
              </div>
            </div>

            {showShortcutTip && (
              <div
                className="wr-shortcut-tip-toast"
                onClick={() => {
                  setShowShortcutTip(false)
                  try { localStorage.setItem('wr:shortcut-tip', '1') } catch {}
                }}
                role="status"
              >
                ⌨️ Tip: Press <kbd>T</kbd> to cycle tones · <kbd>1-4</kbd> switch modes
                <span className="wr-tip-dismiss">got it ×</span>
              </div>
            )}

            <p className="chat-disclaimer">
              WriteRight can make mistakes. Always review important communications before sending.
            </p>
          </div>
        </div>

        <TemplatesDrawer
          open={templatesDrawerOpen}
          templates={templates}
          onClose={() => setTemplatesDrawerOpen(false)}
          onUse={(template) => {
            setInput(template.content.slice(0, CHAR_MAX))
            setMode(template.mode)
            setTone(template.tone)
            void markUsed(template.id)
            taRef.current?.focus()
          }}
          onDelete={(templateId) => { void deleteTemplate(templateId) }}
          onRename={(templateId, nextName) => { void renameTemplate(templateId, nextName) }}
        />
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
      <div className="wr-toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`wr-toast wr-toast-${t.type || 'info'}`}
          >
            <span>{t.msg}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {['QUEUE_ERROR', 'STREAM_ERROR'].includes(t.code || '') && (
                <button
                  className="wr-toast-action"
                  onClick={() => { if (lastSubmittedText) void submitRef.current(lastSubmittedText) }}
                >
                  Retry
                </button>
              )}
              <button className="wr-toast-dismiss" onClick={() => dismiss(t.id)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
