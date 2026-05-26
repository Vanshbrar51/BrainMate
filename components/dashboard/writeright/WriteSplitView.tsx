// components/dashboard/writeright/WriteSplitView.tsx
// Renders the side-by-side comparison (original vs improved) with sentence-level interactive refinement.

import React from 'react'

interface WriteSplitViewProps {
  originalText: string
  improvedText: string
  selectedSentenceIndex: number | null
  onSelectSentence: (sentence: string, index: number, clientRect: DOMRect | null) => void
}

export const WriteSplitView: React.FC<WriteSplitViewProps> = ({
  originalText,
  improvedText,
  selectedSentenceIndex,
  onSelectSentence
}) => {
  // Split text into sentences using positive lookbehind for terminal punctuation.
  // Falls back to simple split if lookbehind is not fully supported or empty.
  const getSentences = (text: string): string[] => {
    if (!text) return []
    try {
      // Splits by sentence boundaries, keeping punctuation
      return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
    } catch {
      // Fallback for older engines
      return text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
    }
  }

  const sentences = getSentences(improvedText)

  const handleSentenceClick = (e: React.MouseEvent<HTMLSpanElement>, sentence: string, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSelectSentence(sentence, index, rect)
  }

  return (
    <div className="wr-split-container">
      {/* Left Column: Original Draft */}
      <div className="wr-split-column">
        <div className="wr-split-header flex justify-between items-center">
          <span>📝 Original Draft</span>
          <span className="text-[10px] uppercase font-bold text-[var(--wr-text-3)]">Read-Only</span>
        </div>
        <div className="wr-split-body bg-[var(--wr-surface-3)] whitespace-pre-wrap select-text">
          {originalText || "No original draft entered yet."}
        </div>
      </div>

      {/* Right Column: AI Improved (Sentence-level Interactive) */}
      <div className="wr-split-column">
        <div className="wr-split-header flex justify-between items-center">
          <span>✨ Refined Result</span>
          <span className="text-[10px] uppercase font-bold text-[var(--wr-accent)]">Click sentence to refine</span>
        </div>
        <div className="wr-split-body">
          {sentences.length === 0 ? (
            <p className="text-[var(--wr-text-3)] text-sm">Waiting for improved output...</p>
          ) : (
            <p className="leading-relaxed text-[var(--wr-text)]">
              {sentences.map((sentence, idx) => {
                const isSelected = selectedSentenceIndex === idx
                return (
                  <span
                    key={idx}
                    onClick={(e) => handleSentenceClick(e, sentence, idx)}
                    className={`wr-split-sentence inline ${isSelected ? 'selected' : ''}`}
                    title="Click to refine this sentence"
                  >
                    {sentence}{' '}
                  </span>
                )
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
export default WriteSplitView
