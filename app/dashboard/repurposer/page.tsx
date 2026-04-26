'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Send,
  Paperclip,
  FileCode,
  ArrowUpRight,
  RefreshCcw,
  Users,
  Zap,
} from 'lucide-react'
import { type Message, UserMessage, AIMessage, AIThinking, InsightBlock } from '@/components/dashboard/ChatMessage'

const CAPABILITIES = [
  {
    title: 'Format conversion',
    desc: 'Blog posts to threads, articles to scripts',
    Icon: RefreshCcw,
  },
  {
    title: 'Audience targeting',
    desc: 'Adjust tone for LinkedIn, X, or email',
    Icon: Users,
  },
  {
    title: 'Hook optimization',
    desc: 'Generate high-converting openers',
    Icon: Zap,
  },
]

const PROMPTS = [
  'Turn this blog post into a 10-part Twitter thread',
  'Create a LinkedIn post with a scroll-stopping hook from this article',
  'Generate a 30-second TikTok script from this product outline',
]

const MOCK_AI: React.ReactNode = (
  <>
    <p style={{ marginBottom: 12, color: 'var(--text-1)', fontWeight: 600 }}>Generated draft summary</p>
    <InsightBlock>
      Hook: Most creators waste 80% of their best ideas because they only publish once.
    </InsightBlock>
    <p>
      I transformed your source into short-form and professional variants, keeping tone and core
      narrative aligned.
    </p>
  </>
)

export default function ContentFlowPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [activePlatform, setActivePlatform] = useState('Twitter/X')
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
      await new Promise((r) => setTimeout(r, 1250)) // TODO: replace with real Anthropic API call
      setMessages((p) => [...p, { role: 'ai', content: MOCK_AI }])
      setLoading(false)
      scrollBottom()
    },
    [input, loading]
  )

  return (
    <div className="chat-workspace-with-panel" data-module="content">
      <div className="chat-workspace-main">
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 20,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(61,106,122,0.1)',
            border: '1px solid rgba(61,106,122,0.2)',
            borderRadius: 9999,
            padding: '4px 12px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--mod-content)',
              animation: 'pulse 2s infinite',
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--mod-content)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Repurposing Active
          </span>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-scroll-inner">
            {!hasStarted && (
              <div className="chat-empty">
                <div
                  className="chat-module-icon"
                  style={{ background: 'var(--mod-content-bg)', borderColor: 'var(--mod-content-border)' }}
                >
                  🔁
                </div>
                <h1 className="chat-module-title">Transform your content</h1>
                <p className="chat-module-tagline">
                  Paste a link, an article, or an outline to start repurposing.
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

                <div className="chat-prompts-list" style={{ marginTop: 8 }}>
                  {PROMPTS.map((p) => (
                    <button key={p} className="chat-prompt-row" onClick={() => submit(p)}>
                      <span className="chat-prompt-chip-title">{p}</span>
                      <ArrowUpRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
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
                    <AIMessage
                      key={i}
                      content={m.content}
                      emoji="🔁"
                      moduleColor="var(--mod-content)"
                    />
                  )
                )}
                {loading && <AIThinking emoji="🔁" />}
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
                placeholder="Paste your source content or instructions here..."
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
                  <button className="chat-tool-btn" aria-label="Attach source">
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
              ContentFlow learns your voice over time. Press Enter to generate.
            </p>
          </div>
        </div>
      </div>

      <div className="chat-right-panel">
        <div className="chat-panel-header">Output Formats</div>
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {['Twitter/X', 'LinkedIn', 'Newsletter', 'Instagram'].map((p) => (
              <button
                key={p}
                className={'tab-pill' + (activePlatform === p ? ' active' : '')}
                onClick={() => setActivePlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 12, padding: 16, minHeight: 200 }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', marginTop: 40 }}>
              Generate content to see your {activePlatform} output here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
