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
