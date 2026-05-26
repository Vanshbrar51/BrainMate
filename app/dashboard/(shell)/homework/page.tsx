'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, BookOpen, ArrowUpRight, GraduationCap, Lightbulb, HelpCircle } from 'lucide-react'
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
    title: 'Socratic Method',
    desc: 'Get guided hints and questions that lead you to the solution.',
    Icon: HelpCircle,
  },
  {
    title: 'Concept Breakdown',
    desc: 'Complex topics explained with simple, relatable analogies.',
    Icon: Lightbulb,
  },
  {
    title: 'Step-by-step Help',
    desc: 'Numbered logic flows to master difficult problem sets.',
    Icon: GraduationCap,
  },
]

const PROMPTS = [
  {
    title: 'Explain Quantum Tunneling',
    sub: 'Use a simple analogy I can understand.',
    full: 'Can you explain quantum tunneling using a simple analogy?',
  },
  {
    title: 'Solve this Math problem',
    sub: 'Help me understand the logic, dont just give the answer.',
    full: 'Can you help me solve this calculus problem step-by-step?',
  },
  {
    title: 'Review my Economics essay',
    sub: 'Check my arguments on supply-side theory.',
    full: 'Can you review my essay on supply-side economics?',
  },
  {
    title: 'CS Algorithm help',
    sub: 'Explain Big O notation with examples.',
    full: 'Can you explain Big O notation and how to calculate it?',
  },
]

export default function StudyMatePage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
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
        const response = await apiPost<{ content: string }>('/api/writeright/homework', { prompt: msg })
        setMessages((p) => [...p, { role: 'ai', content: <MarkdownContent content={response.content} /> }])
      } catch (err) {
        console.error('StudyMate error:', err)
        setMessages((p) => [
          ...p,
          { role: 'ai', content: 'Sorry, I encountered an error. Please try again.' },
        ])
      } finally {
        setLoading(false)
        scrollBottom()
      }
    },
    [input, loading, scrollBottom]
  )

  return (
    <div className="chat-workspace" data-module="study">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-scroll-inner">
          {!hasStarted && (
            <div className="chat-empty">
              <div
                className="chat-module-icon"
                style={{ background: 'var(--mod-study-bg)', borderColor: 'var(--mod-study-border)' }}
              >
                🎓
              </div>
              <h1 className="chat-module-title">StudyMate</h1>
              <p className="chat-module-tagline">
                Master complex concepts with a Socratic AI tutor.
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
                  <AIMessage key={i} content={m.content} emoji="🎓" moduleColor="var(--mod-study)" />
                )
              )}
              {loading && <AIThinking emoji="🎓" />}
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
              placeholder="Ask a question about any subject or paste a problem..."
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
                <button className="chat-tool-btn" aria-label="Attach file">
                  <Paperclip size={17} />
                </button>
                <button className="chat-tool-btn" aria-label="Attach book">
                  <BookOpen size={17} />
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
            StudyMate is for learning. Please use it responsibly and verify key facts.
          </p>
        </div>
      </div>
    </div>
  )
}
