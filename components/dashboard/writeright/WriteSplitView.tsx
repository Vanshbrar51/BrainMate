// components/dashboard/writeright/WriteSplitView.tsx
import React from 'react'

interface WriteSplitViewProps {
  originalText: string
  improvedText: string
  selectedSentenceIndex: number | null
  onSelectSentence: (sentence: string, index: number, clientRect: DOMRect | null) => void
}

export const WriteSplitView: React.FC<WriteSplitViewProps> = ({ originalText, improvedText, selectedSentenceIndex, onSelectSentence }) => {
  const getSentences = (text: string): string[] => {
    if (!text) return []
    try {
      return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
    } catch {
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
      <div className="wr-split-column">
        <div className="wr-split-header">
          <span>📝 Original Draft</span>
          <span className="wr-split-header-badge">Read-Only</span>
        </div>
        <div className="wr-split-body wr-split-orig-highlight">
          {originalText || 'No original draft entered yet.'}
        </div>
      </div>
      <div className="wr-split-column">
        <div className="wr-split-header">
          <span>✨ Refined Result</span>
          <span className="wr-split-header-badge-accent">Click sentence to refine</span>
        </div>
        <div className="wr-split-body">
          {sentences.length === 0 ? (
            <p className="wr-split-empty">Waiting for improved output...</p>
          ) : (
            <p className="wr-split-text">
              {sentences.map((sentence, idx) => (
                <span
                  key={idx}
                  onClick={(e) => handleSentenceClick(e, sentence, idx)}
                  className={`wr-split-sentence${selectedSentenceIndex === idx ? ' selected' : ''}`}
                  title="Click to refine this sentence"
                >
                  {sentence}{' '}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default WriteSplitView
