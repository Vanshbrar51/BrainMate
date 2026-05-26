'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, User, ArrowUpRight, Trophy, Target, MessageSquare, Briefcase } from 'lucide-react'
import {
  type Message,
  UserMessage,
  AIMessage,
  AIThinking,
} from '@/components/dashboard/ChatMessage'
import MarkdownContent from '@/components/dashboard/MarkdownContent'
import { apiPost } from '@/lib/api-client'

const CAPABILITIES = [
  {
    title: 'Role-specific Prep',
    desc: 'Simulate interviews for specific roles, levels, and industries.',
    Icon: Briefcase,
  },
  {
    title: 'STAR Evaluation',
    desc: 'Get feedback on behavioral answers using the STAR framework.',
    Icon: Target,
  },
  {
    title: 'Actionable Scoring',
    desc: 'See your score and specific tips to improve your answers.',
    Icon: Trophy,
  },
]

const PROMPTS = [
  {
    title: 'Senior Frontend Role',
    sub: 'React, System Design, and Leadership.',
    full: 'Can we start a mock interview for a Senior Frontend Engineer role?',
  },
  {
    title: 'Product Manager Role',
    sub: 'Strategy, Prioritization, and Metrics.',
    full: 'I want to practice for a Product Manager interview.',
  },
  {
    title: 'Behavioral Questions',
    sub: 'Conflict resolution and leadership stories.',
    full: 'Help me practice behavioral interview questions.',
  },
  {
    title: 'System Design',
    sub: 'Scalability, Latency, and Architecture.',
    full: 'Let’s do a system design interview for a large-scale app.',
  },
]

export default function InterviewProPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [sessionId] = useState(() => Math.random().toString(36).substring(7))
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollBottom = useCallback(() =>
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 60), [])

  const submit = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim()
      if (!msg || loading) return
      
      setLoading(true)
      setInput('')
      setHasStarted(true)
      setMessages((p) => [...p, { role: 'user', content: msg }])
      scrollBottom()

      try {
        const response = await apiPost<{ content: string }>('/api/writeright/interview', { 
          prompt: msg,
          session_id: sessionId
        })
        setMessages((p) => [...p, { role: 'ai', content: <MarkdownContent content={response.content} /> }])
      } catch (err) {
        console.error('InterviewPro error:', err)
        setMessages((p) => [
          ...p,
          { role: 'ai', content: 'Sorry, I encountered an error. Please try again.' },
        ])
      } finally {
        setLoading(false)
        scrollBottom()
      }
    },
    [input, loading, scrollBottom, sessionId]
  )

  return (
    <div className="chat-workspace" data-module="interview">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-scroll-inner">
          {!hasStarted && (
            <div className="chat-empty">
              <div
                className="chat-module-icon"
                style={{ background: 'var(--mod-interview-bg)', borderColor: 'var(--mod-interview-border)' }}
              >
                👔
              </div>
              <h1 className="chat-module-title">InterviewPro</h1>
              <p className="chat-module-tagline">
                Practice with an AI interviewer and get instant feedback.
              </p>

              <div className="chat-caps-grid">
                {CAPABILITIES.map((c) => (
                  <div key={c.title} className="chat-cap-card">
                    <div className="chat-cap-icon">
                      <c.Icon size={15} strokeWidth={1.8} />
                    </div>
                    <p className="chat-cap-title">{c.title}</p>
                    <p className="chat-cap-desc">{c.desc}</p>
                  </div>
                ))}
              </div>

              <div className="chat-prompts-grid" style={{ marginTop: 8 }}>
                {PROMPTS.map((p) => (
                  <button key={p.title} className="chat-prompt-chip" onClick={() => submit(p.full)}>
                    <span className="chat-prompt-chip-title">
                      {p.title}{' '}
                      <ArrowUpRight
                        size={13}
                        style={{ color: 'var(--text-3)', flexShrink: 0 }}
                      />
                    </span>
                    <span className="chat-prompt-chip-sub">{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasStarted && (
            <div className="chat-messages">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <UserMessage key={i} content={m.content} />
                ) : (
                  <AIMessage key={i} content={m.content} emoji="👔" moduleColor="var(--mod-interview)" />
                )
              )}
              {loading && <AIThinking emoji="👔" />}
            </div>
          )}
        </div>
      </div>

      <div className="chat-input-bar">
        <div className="chat-input-bar-inner">
          <div className="chat-input-box">
            <textarea
              ref={taRef}
              className="chat-textarea"
              placeholder="Type your response or ask for a specific role prep..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 260) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={2}
            />
            <div className="chat-input-footer">
              <div className="chat-tools-left">
                <button className="chat-tool-btn" aria-label="Profile">
                  <User size={17} />
                </button>
                <button className="chat-tool-btn" aria-label="History">
                  <MessageSquare size={17} />
                </button>
              </div>
              <div className="chat-tools-right">
                <span className="chat-hint">↵ to send</span>
                <button
                  className="chat-send-btn"
                  onClick={() => submit()}
                  disabled={!input.trim() || loading}
                  aria-label="Send"
                >
                  <Send size={15} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </div>
          <p className="chat-disclaimer">
            InterviewPro provides simulations. Real interview outcomes depend on your performance.
          </p>
        </div>
      </div>
    </div>
  )
}
