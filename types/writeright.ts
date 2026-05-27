export type WritingMode = 'email' | 'paragraph' | 'linkedin' | 'whatsapp'
export type ToneOption = 'Professional' | 'Friendly' | 'Concise' | 'Academic' | 'Assertive'
export type VoiceLang = 'en-IN' | 'hi-IN' | 'en-US'
export type OutputLang = 'en' | 'hindi' | 'tamil' | 'marathi' | 'bengali' | 'telugu'

export interface AIQualityScores {
  clarity: number
  tone: number
  impact: number
  verdict: string
}

export interface AIJobResult {
  improved_text: string
  english_version?: string | null
  teaching: {
    mistakes: string[]
    better_versions: string[]
    explanations: string[]
  }
  extraction?: {
    action_items: string[]
    deadlines: string[]
    monetary_values: string[]
    meeting_request: {
      found: boolean
      title?: string
      time?: string
      intent?: string
    }
  }
  follow_up: string
  suggestions?: string[]
  scores?: AIQualityScores
  model: string
  prompt_tokens: number
  completion_tokens: number
}

export interface TriageItem {
  id: string
  subject: string
  summary: string
  urgency: 'High' | 'Medium' | 'Low'
  category: string
  smart_replies: string[]
  action_items: string[]
  original_segment: string
}

export interface TriageResponse {
  items: TriageItem[]
}

export type WriteRightMessage =
  | {
    id: string
    role: 'user'
    content: string
    timestamp?: number
  }
  | {
    id: string
    role: 'ai'
    kind: 'result'
    before: string
    jobResult: AIJobResult
    jobId?: string | null
    chatId?: string | null
    mode: WritingMode
    tone: ToneOption
    intensity: number
    outputLang: OutputLang
    prevScores?: AIQualityScores
    timestamp?: number
  }
  | {
    id: string
    role: 'ai'
    kind: 'notice'
    content: string
    timestamp?: number
  }
  | {
    id: string
    role: 'ai'
    kind: 'error'
    content: string
    retryText?: string
    timestamp?: number
  }

export interface VoiceExample {
  id: string
  content: string
  created_at: string
}

// ============================================================
// Feature 3 — Scheduled Send
// ============================================================

export interface ScheduledSend {
  id: string
  clerk_user_id: string
  gmail_email: string
  recipient_email: string
  subject: string
  body: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  created_at: string
  updated_at: string
}

// ============================================================
// Feature 4 — Contact Intelligence
// ============================================================

export interface ContactIntel {
  email: string
  name: string
  emailsExchanged: number
  avgResponseHours: number
  toneBadges: string[]
  lastContactedDays: number
  aiSummary: string
  loading?: boolean
}

// ============================================================
// Feature 6 — Priority & Labels
// ============================================================

export type PriorityScore = 1 | 2 | 3 | 4 | 5
export type EmailLabel = 'URGENT' | 'ACTION_REQUIRED' | 'FYI' | 'NEWSLETTER' | 'CLIENT' | 'NONE'

export interface EmailClassification {
  priority: PriorityScore
  label: EmailLabel
  labelColor: string
}

// ============================================================
// Feature 7 — Split View
// ============================================================

export interface SplitViewState {
  active: boolean
  selectedSentenceIndex: number | null
}

// ============================================================
// Feature 8 — Writing Coach
// ============================================================

export interface CoachMetrics {
  clarity: number       // 0-100
  formality: number     // 0-100
  conciseness: number   // 0-100
  indianEnglish: number // 0-100 (100 = clean, 0 = many patterns)
  passiveVoice: number  // 0-100 (100 = all active)
  suggestions: string[] // max 3 actionable tips
}

// ============================================================
// Feature 9 — Advanced Template System
// ============================================================

export interface TemplateRow {
  id: string
  name: string
  content: string
  mode: WritingMode
  tone: ToneOption
  use_count: number
  created_at: string
  updated_at: string
  category?: string
  tags?: string[]
  is_ai_generated?: boolean
  preview_text?: string
  sort_order?: number
}

export interface TemplateSuggestion {
  message: string
  mode: WritingMode
  tone: ToneOption
}

// ============================================================
// Feature 10 — Analytics
// ============================================================

export interface AnalyticsData {
  heatmap: Array<{ date: string; count: number }>
  score_trends: Array<{ date: string; clarity: number; tone: number; impact: number }>
  mode_distribution: Array<{ mode: string; count: number; percent: number }>
  tone_distribution: Array<{ tone: string; count: number; percent: number }>
  vocabulary_stats: {
    unique_words_used: number
    avg_sentence_length: number
    top_mistakes: Array<{ mistake: string; count: number }>
    most_improved_areas: string[]
  }
  writing_dna: {
    style_summary: string
    signature_phrases: string[]
    improvement_trajectory: 'improving' | 'stable' | 'declining'
    percentile: number
  }
  streak: { current: number; longest: number; total_days: number }
}

// ============================================================
// Feature 11 — Smart Context Memory (Writing Preferences)
// ============================================================

// UI State Extensions
export interface UIPreferences {
  sidebarOpen: boolean
  analyticsOpen: boolean
  coachBarEnabled: boolean
  splitViewDefault: boolean
  focusModeEnabled: boolean
  grammarScanEnabled: boolean
}

export interface WritingPreferences {
  preferredTone: ToneOption
  preferredMode: WritingMode
  preferredIntensity: number
  preferredOutputLang: OutputLang
  favouriteChips: string[]
  uiPreferences: UIPreferences
}

// ============================================================
// Gmail Enhancements
// ============================================================

export interface GmailContactHistory {
  totalEmails: number
  avgResponseHours: number | null
  lastContactedDaysAgo: number | null
  dominantTone: string
  relationshipSummary: string
  recentSnippets: string[]
}

export interface GmailThreadMessage {
  id: string
  sender_name: string
  sender_email: string
  body_plain: string
  timestamp: string
  is_from_user: boolean
}

export interface GmailThreadIntelligence {
  thread_id: string
  messages: GmailThreadMessage[]
  ai_summary: string
  action_items: string[]
  detected_deadline: string | null
  tone_assessment: string
  suggested_reply_context: string
}

export interface GmailScheduledSend {
  id: string
  gmail_email: string
  recipient_email: string
  subject: string
  body: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  created_at: string
}

// ============================================================
// Analytics Enhancements
// ============================================================

export type ImprovementTrajectory = 'improving' | 'stable' | 'declining'

export interface WritingDNA {
  style_summary: string
  signature_phrases: string[]
  improvement_trajectory: ImprovementTrajectory
  percentile: number
  dominant_mode: string
  dominant_tone: string
}

// ============================================================
// Feature 12 — Collaborative Drafts
// ============================================================

export interface CollabComment {
  id: string
  share_token: string
  display_name: string
  comment: string
  is_ai_suggestion: boolean
  created_at: string
}

// ============================================================
// Feature 13 — Grammar Annotation
// ============================================================

export interface GrammarIssue {
  start: number
  end: number
  type: 'grammar' | 'style' | 'indian_english' | 'passive' | 'wordy'
  original: string
  suggestion: string
  explanation: string
}

// ============================================================
// Feature 15 — Email Chain Optimizer
// ============================================================

export interface EmailChainMessage {
  id: string
  label: string
  body: string
  isAI: boolean
  collapsed: boolean
}

export interface EmailChainAdvice {
  negotiationStatus: string
  toneTrend: 'escalating' | 'de-escalating' | 'neutral'
  recommendedNextMove: string
  riskAssessment: string
}
