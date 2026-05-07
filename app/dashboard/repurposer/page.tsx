'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, FileText, ArrowUpRight, Share2, Layers, Zap, Twitter, Linkedin, Mail } from 'lucide-react'
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
    title: 'Multi-platform support',
    desc: 'Twitter threads, LinkedIn posts, and Newsletter drafts from one source.',
    Icon: Layers,
  },
  {
    title: 'Smart Formatting',
    desc: 'Automatically applies character limits, hooks, and CTAs per platform.',
    Icon: Zap,
  },
  {
    title: 'Brand Consistency',
    desc: 'Maintain your core message across different distribution channels.',
    Icon: Share2,
  },
]

const PROMPTS = [
  {
    title: 'Blog to Twitter Thread',
    sub: 'Numbered thread with a strong hook.',
    full: 'Repurpose this blog post into a 5-tweet Twitter thread.',
  },
  {
    title: 'Video to LinkedIn Post',
    sub: 'Professional summary with a CTA.',
    full: 'Turn this video transcript into a high-engagement LinkedIn post.',
  },
  {
    title: 'Email to Newsletter',
    sub: 'Structure for weekly distribution.',
    full: 'Convert this internal update into a customer-facing newsletter.',
  },
]

const PLATFORMS = [
  { id: 'twitter', label: 'Twitter/X', icon: Twitter },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'newsletter', label: 'Newsletter', icon: Mail },
]

export default function ContentFlowPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [targetPlatform, setTargetPlatform] = useState('linkedin')
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
      setMessages((p) => [...p, { role: 'user', content: `[${targetPlatform}] ${msg}` }])
      scrollBottom()

      try {
        const response = await apiPost<{ content: string }>('/api/writeright/repurpose', { 
          prompt: msg,
          target_platform: targetPlatform
        })
        setMessages((p) => [...p, { role: 'ai', content: <MarkdownContent content={response.content} /> }])
      } catch (err) {
        console.error('ContentFlow error:', err)
        setMessages((p) => [
          ...p,
          { role: 'ai', content: 'Sorry, I encountered an error. Please try again.' },
        ])
      } finally {
        setLoading(false)
        scrollBottom()
      }
    },
    [input, loading, scrollBottom, targetPlatform]
  )

  return (
    <div className="chat-workspace" data-module="content">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-scroll-inner">
          {!hasStarted && (
            <div className="chat-empty">
              <div
                className="chat-module-icon"
                style={{ background: 'var(--mod-content-bg)', borderColor: 'var(--mod-content-border)' }}
              >
                ♻️
              </div>
              <h1 className="chat-module-title">ContentFlow</h1>
              <p className="chat-module-tagline">
                Repurpose your content for any platform in seconds.
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
                  <AIMessage key={i} content={m.content} emoji="♻️" moduleColor="var(--mod-content)" />
                )
              )}
              {loading && <AIThinking emoji="♻️" />}
            </div>
          )}
        </div>
      </div>

      <div className="chat-input-bar">
        <div className="chat-input-bar-inner">
          <div className="chat-platforms-selector" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setTargetPlatform(p.id)}
                className={`chat-platform-btn ${targetPlatform === p.id ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  background: targetPlatform === p.id ? 'var(--bg-subtle)' : 'transparent',
                  color: targetPlatform === p.id ? 'var(--text-1)' : 'var(--text-3)',
                  transition: 'all 0.2s ease',
                }}
              >
                <p.icon size={14} />
                {p.label}
              </button>
            ))}
          </div>

          <div className="chat-input-box">
            <textarea
              ref={taRef}
              className="chat-textarea"
              placeholder="Paste the source content you want to repurpose..."
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
                  <FileText size={17} />
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
            ContentFlow helps with distribution. Always review the final copy before posting.
          </p>
        </div>
      </div>
    </div>
  )
}
