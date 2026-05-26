// lib/grammar-checker.ts
// Pure client-side grammar and style checker.
// Uses regex patterns to identify issues and returns character offsets.

import type { GrammarIssue } from '@/types/writeright'

// ---------------------------------------------------------------------------
// Rule Definitions and Matching logic
// ---------------------------------------------------------------------------

export function checkGrammar(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = []
  if (!text || text.trim().length === 0) return []

  const lowerText = text.toLowerCase()

  // Helper to push non-overlapping issues
  function addIssue(issue: GrammarIssue) {
    // Avoid exact duplicate ranges
    const isDuplicate = issues.some(
      existing => existing.start === issue.start && existing.end === issue.end
    )
    if (!isDuplicate) {
      issues.push(issue)
    }
  }

  // 1. Double word repetition (the the, a a, is is, etc.)
  const doubleWordRegex = /\b([a-z]+)\s+\1\b/gi
  let match: RegExpExecArray | null
  while ((match = doubleWordRegex.exec(text)) !== null) {
    const original = match[0]
    const word = match[1]
    addIssue({
      start: match.index,
      end: match.index + original.length,
      type: 'grammar',
      original,
      suggestion: word,
      explanation: `Repeated word "${word}". Remove the duplicate.`
    })
  }

  // 2. Article errors (e.g. "a apple", "an hotel")
  const aBeforeVowel = /\b(a)\s+(apple|orange|egg|email|hour|idea|option|issue|event|item|user-experience|invite)\b/gi
  while ((match = aBeforeVowel.exec(text)) !== null) {
    const original = match[0]
    const vowelWord = match[2]
    addIssue({
      start: match.index,
      end: match.index + original.length,
      type: 'grammar',
      original,
      suggestion: `an ${vowelWord}`,
      explanation: `Use "an" before words starting with a vowel sound.`
    })
  }

  const anBeforeConsonant = /\b(an)\s+(hotel|chat|message|user|template|paragraph|voice|draft|page|file|key|code|link|button|tab|row)\b/gi
  while ((match = anBeforeConsonant.exec(text)) !== null) {
    const original = match[0]
    const consonantWord = match[2]
    addIssue({
      start: match.index,
      end: match.index + original.length,
      type: 'grammar',
      original,
      suggestion: `a ${consonantWord}`,
      explanation: `Use "a" before words starting with a consonant sound.`
    })
  }

  // 3. Countable nouns: less vs fewer
  const lessFewerRegex = /\bless\s+(books|people|emails|templates|comments|messages|users|items|friends|days|hours|minutes|seconds)\b/gi
  while ((match = lessFewerRegex.exec(text)) !== null) {
    const original = match[0]
    const noun = original.split(/\s+/)[1]
    addIssue({
      start: match.index,
      end: match.index + original.length,
      type: 'grammar',
      original,
      suggestion: `fewer ${noun}`,
      explanation: `Use "fewer" instead of "less" for countable nouns.`
    })
  }

  // 4. Sentence starting with lowercase after period
  // We match terminal punctuation followed by space and a lowercase letter.
  const lowercaseAfterPeriod = /([\.!\?])\s+([a-z])/g
  while ((match = lowercaseAfterPeriod.exec(text)) !== null) {
    // index points to the start of the match (e.g., ". s")
    const punctuation = match[1]
    const letter = match[2]
    const startOffset = match.index + punctuation.length + (match[0].length - punctuation.length - 1)
    addIssue({
      start: startOffset,
      end: startOffset + 1,
      type: 'grammar',
      original: letter,
      suggestion: letter.toUpperCase(),
      explanation: 'Capitalize the first letter of a sentence.'
    })
  }

  // 5. Long sentences (>35 words)
  // Split into sentences using punctuation, but track character indexes.
  const sentenceBoundaryRegex = /([^.!?]+([.!?]+|$))/g
  let sentMatch: RegExpExecArray | null
  while ((sentMatch = sentenceBoundaryRegex.exec(text)) !== null) {
    const sentenceText = sentMatch[0]
    const words = sentenceText.trim().split(/\s+/)
    if (words.length > 35) {
      addIssue({
        start: sentMatch.index,
        end: sentMatch.index + sentenceText.length,
        type: 'style',
        original: sentenceText.trim(),
        suggestion: sentenceText.trim(), // User must manually edit/split
        explanation: 'This sentence has more than 35 words. Consider splitting it into shorter sentences.'
      })
    }
  }

  // 6. Passive voice patterns (e.g. "is/are/was/were/be/been/being + past participle")
  const passiveVerbRegex = /\b(is|am|are|was|were|be|been|being)\s+([a-z]+ed|[a-z]+en|done|written|taken|seen|known|made|given|chosen|sent|kept|spent|broken|built|bought|brought|caught|fought|taught)\b/gi
  while ((match = passiveVerbRegex.exec(text)) !== null) {
    const original = match[0]
    addIssue({
      start: match.index,
      end: match.index + original.length,
      type: 'passive',
      original,
      suggestion: original,
      explanation: 'Passive voice detected. Try rewriting using active verbs.'
    })
  }

  // 7. Indian English patterns
  const iePatterns = [
    { pattern: /\bdo the needful\b/gi, suggestion: 'do what is required', explanation: 'Replace colonial phrase "do the needful" with standard English.' },
    { pattern: /\bplease revert\b/gi, suggestion: 'please reply', explanation: 'Use "reply" or "respond" instead of "revert".' },
    { pattern: /\brevert back\b/gi, suggestion: 'reply', explanation: '"Revert back" is redundant. Use "reply" or "respond".' },
    { pattern: /\bprepone\b/gi, suggestion: 'bring forward / reschedule earlier', explanation: '"Prepone" is Indian English. Use "reschedule earlier".' },
    { pattern: /\bpassed out\b/gi, suggestion: 'graduated', explanation: 'Use "graduated" to indicate finishing school/college.' },
    { pattern: /\bout of station\b/gi, suggestion: 'out of town', explanation: 'Use "out of town" or "away" instead of "out of station".' },
    { pattern: /\bdiscuss about\b/gi, suggestion: 'discuss', explanation: 'Avoid "discuss about". Just use "discuss".' },
    { pattern: /\border for\b/gi, suggestion: 'order', explanation: 'Avoid "order for" when ordering items. Just use "order".' },
    { pattern: /\btoday morning\b/gi, suggestion: 'this morning', explanation: 'Use "this morning" instead of "today morning".' },
    { pattern: /\byesterday night\b/gi, suggestion: 'last night', explanation: 'Use "last night" instead of "yesterday night".' },
    { pattern: /\bcoping up with\b/gi, suggestion: 'coping with', explanation: 'Use "coping with" instead of "coping up with".' },
    { pattern: /\bhave a doubt\b/gi, suggestion: 'have a question', explanation: 'Use "question" instead of "doubt" when asking for clarification.' },
    { pattern: /\bdoubt regarding\b/gi, suggestion: 'question regarding', explanation: 'Use "question" instead of "doubt".' }
  ]

  for (const item of iePatterns) {
    let ieMatch: RegExpExecArray | null
    // Reset regex index since it might have been run before
    item.pattern.lastIndex = 0
    while ((ieMatch = item.pattern.exec(text)) !== null) {
      addIssue({
        start: ieMatch.index,
        end: ieMatch.index + ieMatch[0].length,
        type: 'indian_english',
        original: ieMatch[0],
        suggestion: item.suggestion,
        explanation: item.explanation
      })
    }
  }

  // 8. Wordy filler phrases
  const fillerPhrases = [
    { pattern: /\bin order to\b/gi, suggestion: 'to' },
    { pattern: /\bdue to the fact that\b/gi, suggestion: 'because' },
    { pattern: /\bso as to\b/gi, suggestion: 'to' },
    { pattern: /\bat the end of the day\b/gi, suggestion: 'ultimately' },
    { pattern: /\bas a matter of fact\b/gi, suggestion: 'actually' },
    { pattern: /\bneedless to say\b/gi, suggestion: 'obviously' },
    { pattern: /\bat this point in time\b/gi, suggestion: 'now' },
    { pattern: /\bfor the purpose of\b/gi, suggestion: 'for' },
    { pattern: /\bwith reference to\b/gi, suggestion: 'about' },
    { pattern: /\bin the event that\b/gi, suggestion: 'if' }
  ]

  for (const item of fillerPhrases) {
    let fillerMatch: RegExpExecArray | null
    item.pattern.lastIndex = 0
    while ((fillerMatch = item.pattern.exec(text)) !== null) {
      addIssue({
        start: fillerMatch.index,
        end: fillerMatch.index + fillerMatch[0].length,
        type: 'wordy',
        original: fillerMatch[0],
        suggestion: item.suggestion,
        explanation: `Filler phrase. Simplify to "${item.suggestion}".`
      })
    }
  }

  // 9. Consecutive sentences starting with "I"
  const sentencesList: Array<{ text: string; start: number; end: number }> = []
  sentenceBoundaryRegex.lastIndex = 0
  while ((sentMatch = sentenceBoundaryRegex.exec(text)) !== null) {
    sentencesList.push({
      text: sentMatch[0],
      start: sentMatch.index,
      end: sentMatch.index + sentMatch[0].length
    })
  }

  for (let i = 0; i < sentencesList.length - 1; i++) {
    const s1 = sentencesList[i].text.trim()
    const s2 = sentencesList[i + 1].text.trim()
    
    // Check if both start with "I " or "I'm" or "I'll" or similar
    const startsWithI = (s: string) => /^[iI]\b/.test(s)
    if (startsWithI(s1) && startsWithI(s2)) {
      addIssue({
        start: sentencesList[i + 1].start,
        end: sentencesList[i + 1].start + s2.split(/\s+/)[0].length,
        type: 'style',
        original: s2.split(/\s+/)[0],
        suggestion: s2.split(/\s+/)[0],
        explanation: 'Consecutive sentences start with "I". Vary sentence openers to improve style.'
      })
    }
  }

  // Sort issues by start character offset
  return issues.sort((a, b) => a.start - b.start)
}
