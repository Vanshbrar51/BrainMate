// lib/writing-coach.ts
// Pure client-side writing analysis.
// Enforces zero-dependency, fast execution for real-time coach feedback.

import type { CoachMetrics } from '@/types/writeright'

// ---------------------------------------------------------------------------
// Dictionaries and Lists
// ---------------------------------------------------------------------------

const INFORMAL_WORDS = new Set([
  'hey', 'hi', 'wanna', 'gonna', 'gotta', 'cool', 'awesome', 'yeah', 'yep',
  'nope', 'stuff', 'guy', 'guys', 'idk', 'tbh', 'imho', 'lol', 'btw', 'pls',
  'thx', 'thanks', 'kid', 'kids', 'cheap', 'lazy', 'hangout', 'sucks', 'crazy'
])

const FILLER_PHRASES = [
  { phrase: /\bin order to\b/gi, suggestion: 'to' },
  { phrase: /\bdue to the fact that\b/gi, suggestion: 'because' },
  { phrase: /\bso as to\b/gi, suggestion: 'to' },
  { phrase: /\bat the end of the day\b/gi, suggestion: 'ultimately' },
  { phrase: /\bas a matter of fact\b/gi, suggestion: 'actually' },
  { phrase: /\bneedless to say\b/gi, suggestion: 'obviously' },
  { phrase: /\bat this point in time\b/gi, suggestion: 'now' },
  { phrase: /\bfor the purpose of\b/gi, suggestion: 'for' },
  { phrase: /\bwith reference to\b/gi, suggestion: 'about' },
  { phrase: /\bin the event that\b/gi, suggestion: 'if' }
]

const INDIAN_ENGLISH_PATTERNS = [
  { pattern: /\bdo the needful\b/gi, suggestion: 'do what is required' },
  { pattern: /\bplease revert\b/gi, suggestion: 'please reply' },
  { pattern: /\brevert back\b/gi, suggestion: 'reply' },
  { pattern: /\bprepone\b/gi, suggestion: 'bring forward / reschedule earlier' },
  { pattern: /\bpassed out\b/gi, suggestion: 'graduated' },
  { pattern: /\bout of station\b/gi, suggestion: 'out of town' },
  { pattern: /\bdiscuss about\b/gi, suggestion: 'discuss' },
  { pattern: /\border for\b/gi, suggestion: 'order' },
  { pattern: /\btoday morning\b/gi, suggestion: 'this morning' },
  { pattern: /\byesterday night\b/gi, suggestion: 'last night' },
  { pattern: /\bcoping up with\b/gi, suggestion: 'coping with' },
  { pattern: /\bhave a doubt\b/gi, suggestion: 'have a question' },
  { pattern: /\bdoubt regarding\b/gi, suggestion: 'question regarding' }
]

// Simple past participle / passive helper (to be used with be-verbs)
const PASSIVE_VERB_PATTERN = /\b(is|am|are|was|were|be|been|being)\s+([a-z]+ed|[a-z]+en|done|written|taken|seen|known|made|given|chosen|sent|kept|spent|broken|built|bought|brought|caught|fought|taught)\b/gi

// Helper to count syllables in a word (rough approximation)
function countWordSyllables(word: string): number {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '')
  if (cleanWord.length <= 3) return 1
  
  // Count vowel groups
  const matches = cleanWord.match(/[aeiouy]+/g)
  let count = matches ? matches.length : 1
  
  // Adjustments for common silent endings
  if (cleanWord.endsWith('es') || cleanWord.endsWith('ed')) {
    count--
  }
  if (cleanWord.endsWith('e') && !cleanWord.endsWith('le')) {
    count--
  }
  
  return Math.max(1, count)
}

// ---------------------------------------------------------------------------
// Main Analysis Function
// ---------------------------------------------------------------------------

export function analyzeText(text: string): CoachMetrics {
  const safeText = (text || '').trim()
  if (safeText.length < 21) {
    return {
      clarity: 100,
      formality: 100,
      conciseness: 100,
      indianEnglish: 100,
      passiveVoice: 100,
      suggestions: []
    }
  }

  // Tokenize
  const sentences = safeText.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = safeText.split(/\s+/).filter(w => w.trim().length > 0)

  const sentenceCount = Math.max(1, sentences.length)
  const wordCount = Math.max(1, words.length)

  // 1. Clarity (Flesch Reading Ease approximation: 206.835 - 1.015 * (words/sentence) - 84.6 * (syllables/words))
  let totalSyllables = 0
  for (const w of words) {
    totalSyllables += countWordSyllables(w)
  }
  const avgSentenceLength = wordCount / sentenceCount
  const avgSyllablesPerWord = totalSyllables / wordCount
  
  let clarityScore = Math.round(206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord))
  clarityScore = Math.max(0, Math.min(100, clarityScore))

  // 2. Formality
  let informalCount = 0
  for (const w of words) {
    const cleanWord = w.toLowerCase().replace(/[^a-z]/g, '')
    if (INFORMAL_WORDS.has(cleanWord)) {
      informalCount++
    }
  }
  const formalityScore = Math.max(0, Math.min(100, Math.round(100 - (informalCount / wordCount) * 400)))

  // 3. Conciseness
  let fillerCount = 0
  for (const item of FILLER_PHRASES) {
    const matches = safeText.match(item.phrase)
    if (matches) {
      fillerCount += matches.length
    }
  }
  const concisenessScore = Math.max(0, Math.min(100, Math.round(100 - (fillerCount / wordCount) * 500)))

  // 4. Indian English
  let ieCount = 0
  for (const item of INDIAN_ENGLISH_PATTERNS) {
    const matches = safeText.match(item.pattern)
    if (matches) {
      ieCount += matches.length
    }
  }
  const ieScore = Math.max(0, Math.min(100, Math.round(100 - (ieCount / wordCount) * 1000)))

  // 5. Passive Voice
  const passiveMatches = safeText.match(PASSIVE_VERB_PATTERN)
  const passiveCount = passiveMatches ? passiveMatches.length : 0
  const passiveScore = Math.max(0, Math.min(100, Math.round(100 - (passiveCount / sentenceCount) * 50)))

  // 6. Suggestions
  const suggestions: string[] = []

  // Check Indian English first
  if (ieScore < 95) {
    for (const item of INDIAN_ENGLISH_PATTERNS) {
      if (item.pattern.test(safeText)) {
        suggestions.push(`Avoid Indian English pattern: Use "${item.suggestion}" instead of "${safeText.match(item.pattern)?.[0]}".`)
        break
      }
    }
  }

  // Check conciseness
  if (concisenessScore < 95 && suggestions.length < 3) {
    for (const item of FILLER_PHRASES) {
      if (item.phrase.test(safeText)) {
        suggestions.push(`Simplify "${safeText.match(item.phrase)?.[0]}" to "${item.suggestion}" to make it more concise.`)
        break
      }
    }
  }

  // Check passive voice
  if (passiveScore < 85 && suggestions.length < 3) {
    suggestions.push('Consider rewriting passive voice sentences using active verbs to add punch.')
  }

  // Check clarity
  if (clarityScore < 60 && suggestions.length < 3) {
    if (avgSentenceLength > 20) {
      suggestions.push('Some sentences are too long. Try splitting them into shorter, punchier sentences.')
    } else {
      suggestions.push('Simplify vocabulary and structure to improve readability.')
    }
  }

  return {
    clarity: clarityScore,
    formality: formalityScore,
    conciseness: concisenessScore,
    indianEnglish: ieScore,
    passiveVoice: passiveScore,
    suggestions: suggestions.slice(0, 3)
  }
}
