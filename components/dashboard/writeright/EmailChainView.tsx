// components/dashboard/writeright/EmailChainView.tsx
// Renders the email chain timeline and negotiation strategy advice panel.
// Facilitates multi-turn email drafting with real-time streaming updates.

import React, { useState, useEffect } from 'react'
import type { EmailChainMessage, EmailChainAdvice } from '@/types/writeright'

interface EmailChainViewProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_MESSAGES: EmailChainMessage[] = [
  {
    id: "msg-1",
    label: "Email 1 (You → Client)",
    body: "Hi Team,\n\nI hope you're doing well. Just checking in to see if you've had a chance to review the contract proposal we sent over last Tuesday. Let me know if you have any questions.\n\nBest,\n[Name]",
    isAI: false,
    collapsed: false
  },
  {
    id: "msg-2",
    label: "Email 2 (Client → You)",
    body: "Hi [Name],\n\nThanks for the reminder. We reviewed the contract and have a few concerns regarding the pricing and payment terms. We'd like to explore a volume discount or net-60 terms instead of net-30.\n\nThanks,\nClient Team",
    isAI: false,
    collapsed: false
  }
]

const DEFAULT_ADVICE: EmailChainAdvice = {
  negotiationStatus: "Evaluating pricing dispute",
  toneTrend: "neutral",
  recommendedNextMove: "Propose a structured volume-based discount tier and maintain net-30 terms.",
  riskAssessment: "Net-60 terms will negatively impact cash flow. Hold firm on payment terms, but offer minor pricing concessions."
}

export const EmailChainView: React.FC<EmailChainViewProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<EmailChainMessage[]>(DEFAULT_MESSAGES)
  const [advice, setAdvice] = useState<EmailChainAdvice>(DEFAULT_ADVICE)
  const [nextGoal, setNextGoal] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Active stream buffer
  const [activeDraftText, setActiveDraftText] = useState('')

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // 1. Update individual message body
  const handleUpdateMessage = (id: string, body: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, body } : m))
  }

  // 2. Toggle collapse message
  const toggleCollapse = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, collapsed: !m.collapsed } : m))
  }

  // 3. Delete email step from timeline
  const handleDeleteStep = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  // 4. Copy entire chain to clipboard
  const handleExport = () => {
    const compiled = messages
      .map(m => `--- ${m.label} ---\n${m.body}`)
      .join("\n\n")

    navigator.clipboard.writeText(compiled)
    alert("Email chain copied to clipboard!")
  }

  // 5. Submit goal and stream next email
  const handleDraftNextEmail = async () => {
    if (!nextGoal.trim()) return
    setLoading(true)
    setActiveDraftText('')

    try {
      const response = await fetch('/api/writeright/email-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, nextGoal })
      })

      if (!response.ok) throw new Error('AI chain draft request failed')
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ""

        for (const line of lines) {
          const cleanLine = line.trim()
          if (cleanLine.startsWith("data: ")) {
            try {
              const data = JSON.parse(cleanLine.slice(6))
              if (data.type === "token" && data.text) {
                setActiveDraftText(prev => prev + data.text)
              }
              if (data.type === "advice" && data.advice) {
                setAdvice(data.advice)
              }
            } catch {
              // Ignore
            }
          }
        }
      }

      // Append completed draft to timeline
      setMessages(prev => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          label: `Email ${prev.length + 1} (You, AI-suggested)`,
          body: activeDraftText,
          isAI: true,
          collapsed: false
        }
      ])
      
      // Clear input state
      setNextGoal('')
      setActiveDraftText('')
    } catch (err) {
      alert('Failed to generate email chain draft')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wr-chain-overlay">
      {/* Left Column: Timeline */}
      <div className="flex flex-col h-full overflow-hidden bg-[var(--wr-surface)] border border-[var(--wr-border)] rounded-[var(--wr-radius)] p-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--wr-border-soft)] pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--wr-text)] flex items-center gap-2">
              🔗 Email Chain Optimizer
            </h2>
            <p className="text-xs text-[var(--wr-text-3)]">Map and strategize your negotiation threads</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleExport}
              className="px-3.5 py-1.5 bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] hover:bg-[var(--wr-border-soft)] text-xs font-semibold rounded-full border border-[var(--wr-border)]"
            >
              📋 Copy Thread
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--wr-surface-2)] text-[var(--wr-text-3)] rounded-full"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages Timeline */}
        <div className="flex-1 overflow-y-auto wr-chain-timeline pr-1 mb-4">
          {messages.map((m) => (
            <div key={m.id} className="wr-chain-step-card border border-[var(--wr-border)] rounded-md bg-[var(--wr-surface)]">
              {/* Card Header */}
              <div 
                onClick={() => toggleCollapse(m.id)}
                className="flex items-center justify-between p-3 bg-[var(--wr-surface-3)] cursor-pointer select-none border-b border-[var(--wr-border-soft)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--wr-text-3)]">{m.collapsed ? '▶' : '▼'}</span>
                  <span className="text-sm font-semibold text-[var(--wr-text)]">{m.label}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteStep(m.id) }}
                  className="text-xs text-[var(--wr-text-3)] hover:text-[var(--wr-error)]"
                >
                  Delete
                </button>
              </div>

              {/* Card Body */}
              {!m.collapsed && (
                <div className="p-3">
                  <textarea
                    value={m.body}
                    onChange={(e) => handleUpdateMessage(m.id, e.target.value)}
                    rows={4}
                    className="w-full text-sm p-2 border border-[var(--wr-border)] bg-[var(--wr-surface)] rounded-md outline-none text-[var(--wr-text)] font-sans resize-vertical leading-relaxed"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Active Streaming Draft Card */}
          {activeDraftText && (
            <div className="wr-chain-step-card border border-[var(--wr-accent)] bg-[var(--wr-accent-soft)] p-3 rounded-md">
              <div className="text-xs font-bold text-[var(--wr-accent)] mb-2 flex items-center gap-1.5">
                <span>⚡ Drafting Response...</span>
              </div>
              <p className="text-sm text-[var(--wr-text)] whitespace-pre-wrap leading-relaxed">
                {activeDraftText}
              </p>
            </div>
          )}
        </div>

        {/* Goal Input Section */}
        <div className="border-t border-[var(--wr-border-soft)] pt-4 flex flex-col gap-3">
          <span className="text-xs font-bold text-[var(--wr-text-3)] uppercase tracking-wider">What should the next email accomplish?</span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Politely declining the Net-60 terms and proposing a 3% volume discount on Net-30."
              value={nextGoal}
              onChange={(e) => setNextGoal(e.target.value)}
              className="flex-1 text-sm px-3.5 py-2 border border-[var(--wr-border)] bg-[var(--wr-surface)] rounded-md outline-none text-[var(--wr-text)]"
              disabled={loading}
            />
            <button
              onClick={handleDraftNextEmail}
              disabled={loading || !nextGoal.trim()}
              className="px-4 py-2 bg-[var(--wr-accent)] hover:bg-[var(--wr-accent-hover)] text-white text-xs font-semibold rounded-md disabled:opacity-50"
            >
              {loading ? 'Drafting...' : 'Draft Response'}
            </button>
          </div>
        </div>

      </div>

      {/* Right Column: AI advice panel */}
      <div className="flex flex-col h-full bg-[var(--wr-surface)] border border-[var(--wr-border)] rounded-[var(--wr-radius)] p-5 overflow-y-auto">
        <span className="text-[10px] font-bold text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">AI Strategic Intelligence</span>
        <h2 className="text-2xl font-display font-medium text-[var(--wr-text)] mb-5">Negotiation Strategy</h2>

        {/* Status block */}
        <div className="mb-5">
          <span className="text-xs text-[var(--wr-text-3)] font-bold uppercase block mb-1">Negotiation Status</span>
          <p className="text-sm font-semibold text-[var(--wr-text)]">{advice.negotiationStatus}</p>
        </div>

        {/* Tone Trend */}
        <div className="mb-5">
          <span className="text-xs text-[var(--wr-text-3)] font-bold uppercase block mb-1.5">Tone Trend</span>
          <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded font-bold ${
            advice.toneTrend === 'escalating' ? 'bg-red-100 text-[var(--wr-error)]' :
            advice.toneTrend === 'de-escalating' ? 'bg-green-100 text-[var(--wr-success)]' :
            'bg-gray-100 text-gray-700'
          }`}>
            {advice.toneTrend === 'escalating' ? '📈 Escalating Conflict' :
             advice.toneTrend === 'de-escalating' ? '📉 De-escalating' :
             '→ Neutral'}
          </span>
        </div>

        {/* Recommended Next Move */}
        <div className="mb-5 bg-[var(--wr-accent-soft)] border-l-2 border-[var(--wr-accent)] p-3 rounded">
          <span className="text-xs text-[var(--wr-accent)] font-bold uppercase block mb-1">Recommended Next Move</span>
          <p className="text-xs text-[var(--wr-text-2)] leading-relaxed">{advice.recommendedNextMove}</p>
        </div>

        {/* Risk Assessment */}
        <div className="bg-red-50 dark:bg-red-950/20 border-l-2 border-[var(--wr-error)] p-3 rounded">
          <span className="text-xs text-[var(--wr-error)] font-bold uppercase block mb-1">Risk Assessment</span>
          <p className="text-xs text-[var(--wr-text-2)] leading-relaxed">{advice.riskAssessment}</p>
        </div>
      </div>
    </div>
  )
}
export default EmailChainView
