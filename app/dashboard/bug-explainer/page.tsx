'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, FileCode, ArrowUpRight, Search, Wrench, Code2 } from 'lucide-react'
import {
  type Message,
  UserMessage,
  AIMessage,
  AIThinking,
  CodeBlock,
  InsightBlock,
} from '@/components/dashboard/ChatMessage'

const CAPABILITIES = [
  {
    title: 'Root-cause analysis',
    desc: 'Paste stack traces to instantly identify the underlying issue.',
    Icon: Search,
  },
  {
    title: 'Patch suggestions',
    desc: 'Get specific, secure code fixes tailored to your framework.',
    Icon: Wrench,
  },
  {
    title: 'Refactor guidance',
    desc: 'Improve readability and performance with best practices.',
    Icon: Code2,
  },
]

const PROMPTS = [
  {
    title: 'Debug my Python error',
    sub: 'Paste a traceback to find the exact line and fix.',
    full: 'Please debug this Python error for me',
  },
  {
    title: 'Review my React component',
    sub: 'Check for re-renders, hooks, and accessibility.',
    full: 'Please review this React component for issues',
  },
  {
    title: 'Explain this regex',
    sub: 'Break down complex patterns step-by-step.',
    full: 'Please explain this regex pattern in detail',
  },
  {
    title: 'Optimize my SQL query',
    sub: 'Improve database performance and index usage.',
    full: 'Help me optimize this SQL query for performance',
  },
]

const MOCK_AI: React.ReactNode = (
  <>
    <p>
      I found the issue. You have a <strong>missing initial value</strong> in your{' '}
      <code
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875em',
          background: 'var(--bg-subtle)',
          padding: '1px 5px',
          borderRadius: 4,
        }}
      >
        Array.reduce()
      </code>{' '}
      call.
    </p>
    <p style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>Root cause</p>
    <p>
      Without an initial value,{' '}
      <code
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875em',
          background: 'var(--bg-subtle)',
          padding: '1px 5px',
          borderRadius: 4,
        }}
      >
        reduce()
      </code>{' '}
      uses the first array element as the accumulator. On an empty array, this throws a
      TypeError immediately.
    </p>
    <CodeBlock
      code={`function calculateTotal(items) {\n  return items.reduce((sum, item) => sum + item.price, 0)\n  //                                                  ^ add this\n}`}
    />
    <InsightBlock>
      <strong style={{ color: 'var(--text-1)' }}>Remember:</strong> Always pass an initial value
      to reduce() — it makes intent explicit and prevents runtime errors on empty arrays.
    </InsightBlock>
  </>
)

export default function DevHelperPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollBottom = () =>
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 60)

  const submit = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim()
      if (!msg || loading) return
      setLoading(true)
      setInput('')
      setHasStarted(true)
      setMessages((p) => [...p, { role: 'user', content: msg }])
      scrollBottom()
      await new Promise((r) => setTimeout(r, 1300)) // TODO: replace with real Anthropic API call
      setMessages((p) => [...p, { role: 'ai', content: MOCK_AI }])
      setLoading(false)
      scrollBottom()
    },
    [input, loading]
  )

  return (
    <div className="chat-workspace" data-module="dev">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-scroll-inner">
          {!hasStarted && (
            <div className="chat-empty">
              <div
                className="chat-module-icon"
                style={{ background: 'var(--mod-dev-bg)', borderColor: 'var(--mod-dev-border)' }}
              >
                🐛
              </div>
              <h1 className="chat-module-title">DevHelper</h1>
              <p className="chat-module-tagline">
                Debug faster, fix safely, and learn why issues happen.
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
                  <AIMessage key={i} content={m.content} emoji="🐛" moduleColor="var(--mod-dev)" />
                )
              )}
              {loading && <AIThinking emoji="🐛" />}
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
              placeholder="Paste your code, describe the error, or ask a question..."
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
                <button className="chat-tool-btn" aria-label="Attach code">
                  <FileCode size={17} />
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
            DevHelper can make mistakes. Always verify critical code and security suggestions.
          </p>
        </div>
      </div>
    </div>
  )
}
