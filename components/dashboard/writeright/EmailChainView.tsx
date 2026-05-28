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

      if (!response.ok) {

        return
      }
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
      setNextGoal('')
      setActiveDraftText('')
    } catch {
      alert('Failed to generate email chain draft')
    } finally {
      setLoading(false)
    }
  }

  const getToneBadgeStyle = (toneTrend: string): React.CSSProperties => {
    if (toneTrend === 'escalating') return { background: 'rgba(220,38,38,0.1)', color: 'var(--wr-error)' }
    if (toneTrend === 'de-escalating') return { background: 'rgba(22,163,74,0.1)', color: 'var(--wr-success)' }
    return { background: 'rgba(107,99,88,0.08)', color: '#6b6358' }
  }

  return (
    <div className="wr-chain-overlay">
      {/* Left Column: Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--wr-surface)', border: '1px solid var(--wr-border)', borderRadius: 'var(--wr-radius)', padding: '20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--wr-border-soft)', paddingBottom: '16px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--wr-text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              🔗 Email Chain Optimizer
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--wr-text-3)', margin: '4px 0 0' }}>Map and strategize your negotiation threads</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleExport}
              style={{ padding: '6px 14px', background: 'var(--wr-surface-2)', color: 'var(--wr-text-2)', fontSize: '12px', fontWeight: 600, borderRadius: '999px', border: '1px solid var(--wr-border)', cursor: 'pointer' }}
            >
              📋 Copy Thread
            </button>
            <button
              onClick={onClose}
              style={{ padding: '6px', background: 'transparent', color: 'var(--wr-text-3)', borderRadius: '999px', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages Timeline */}
        <div className="wr-chain-timeline" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
          {messages.map((m) => (
            <div key={m.id} className="wr-chain-step-card" style={{ border: '1px solid var(--wr-border)', borderRadius: '6px', background: 'var(--wr-surface)' }}>
              {/* Card Header */}
              <div
                onClick={() => toggleCollapse(m.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--wr-surface-2)', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--wr-border-soft)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--wr-text-3)' }}>{m.collapsed ? '▶' : '▼'}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--wr-text)' }}>{m.label}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteStep(m.id) }}
                  style={{ fontSize: '12px', color: 'var(--wr-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = 'var(--wr-error)' }}
                  onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = 'var(--wr-text-3)' }}
                >
                  Delete
                </button>
              </div>

              {/* Card Body */}
              {!m.collapsed && (
                <div style={{ padding: '12px' }}>
                  <textarea
                    value={m.body}
                    onChange={(e) => handleUpdateMessage(m.id, e.target.value)}
                    rows={4}
                    style={{ width: '100%', fontSize: '0.875rem', padding: '8px', border: '1px solid var(--wr-border)', background: 'var(--wr-surface)', borderRadius: '6px', outline: 'none', color: 'var(--wr-text)', fontFamily: 'sans-serif', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Active Streaming Draft Card */}
          {activeDraftText && (
            <div className="wr-chain-step-card" style={{ border: '1px solid var(--wr-accent)', background: 'var(--wr-accent-soft)', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--wr-accent)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚡ Drafting Response...</span>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--wr-text)', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
                {activeDraftText}
              </p>
            </div>
          )}
        </div>

        {/* Goal Input Section */}
        <div style={{ borderTop: '1px solid var(--wr-border-soft)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>What should the next email accomplish?</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. Politely declining the Net-60 terms and proposing a 3% volume discount on Net-30."
              value={nextGoal}
              onChange={(e) => setNextGoal(e.target.value)}
              style={{ flex: 1, fontSize: '0.875rem', padding: '8px 14px', border: '1px solid var(--wr-border)', background: 'var(--wr-surface)', borderRadius: '6px', outline: 'none', color: 'var(--wr-text)' }}
              disabled={loading}
            />
            <button
              onClick={handleDraftNextEmail}
              disabled={loading || !nextGoal.trim()}
              style={{ padding: '8px 16px', background: 'var(--wr-accent)', color: '#fff', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer', opacity: (loading || !nextGoal.trim()) ? 0.5 : 1 }}
            >
              {loading ? 'Drafting...' : 'Draft Response'}
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: AI advice panel */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--wr-surface)', border: '1px solid var(--wr-border)', borderRadius: 'var(--wr-radius)', padding: '20px', overflowY: 'auto' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>AI Strategic Intelligence</span>
        <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-instrument-serif, Georgia, serif)', fontWeight: 500, color: 'var(--wr-text)', marginBottom: '20px', marginTop: 0 }}>Negotiation Strategy</h2>

        {/* Status block */}
        <div style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--wr-text-3)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Negotiation Status</span>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--wr-text)', margin: 0 }}>{advice.negotiationStatus}</p>
        </div>

        {/* Tone Trend */}
        <div style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--wr-text-3)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Tone Trend</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '12px', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, ...getToneBadgeStyle(advice.toneTrend) }}>
            {advice.toneTrend === 'escalating' ? '📈 Escalating Conflict' :
             advice.toneTrend === 'de-escalating' ? '📉 De-escalating' :
             '→ Neutral'}
          </span>
        </div>

        {/* Recommended Next Move */}
        <div style={{ marginBottom: '20px', background: 'var(--wr-accent-soft)', borderLeft: '2px solid var(--wr-accent)', padding: '12px', borderRadius: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--wr-accent)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Recommended Next Move</span>
          <p style={{ fontSize: '12px', color: 'var(--wr-text-2)', lineHeight: 1.6, margin: 0 }}>{advice.recommendedNextMove}</p>
        </div>

        {/* Risk Assessment */}
        <div style={{ background: 'rgba(220,38,38,0.05)', borderLeft: '2px solid var(--wr-error)', padding: '12px', borderRadius: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--wr-error)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Risk Assessment</span>
          <p style={{ fontSize: '12px', color: 'var(--wr-text-2)', lineHeight: 1.6, margin: 0 }}>{advice.riskAssessment}</p>
        </div>
      </div>
    </div>
  )
}
export default EmailChainView
