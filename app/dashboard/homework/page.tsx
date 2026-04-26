'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Send,
  Paperclip,
  FileCode,
  ImagePlus,
  ArrowUpRight,
  Lightbulb,
  PencilRuler,
  BrainCircuit,
} from 'lucide-react'
import { type Message, UserMessage, AIMessage, AIThinking } from '@/components/dashboard/ChatMessage'

const CAPABILITIES = [
  {
    title: 'Guided Explanations',
    desc: 'Complex topics simplified with analogies and examples',
    Icon: Lightbulb,
  },
  {
    title: 'Practice Problems',
    desc: 'Custom quizzes and exercises tailored to your level',
    Icon: PencilRuler,
  },
  {
    title: 'Adaptive Hints',
    desc: 'Nudges that help you think without giving it away',
    Icon: BrainCircuit,
  },
]

const PROMPTS = [
  {
    title: 'Explain integration by parts',
    sub: 'Walk me through the method with an example',
    full: 'Explain integration by parts with an example.',
  },
  {
    title: "Help me understand Newton's laws",
    sub: 'Concepts with real-world analogies',
    full: "Help me understand Newton's laws with real-world analogies.",
  },
  {
    title: 'Solve this equation: x² + 5x + 6 = 0',
    sub: 'Show each step with explanation',
    full: 'Solve this equation step by step: x² + 5x + 6 = 0',
  },
  {
    title: 'Quiz me on supply and demand',
    sub: 'Adaptive questions at my level',
    full: 'Quiz me on supply and demand at my current level.',
  },
]

const MOCK_AI: React.ReactNode = (
  <>
    {[
      {
        title: 'Identify the problem type',
        body: 'This is a quadratic factoring problem. We need two numbers that multiply to +6 and add to +5.',
        formula: '',
      },
      {
        title: 'Find factor pairs',
        body: 'Pairs that multiply to 6: (1,6) and (2,3). Check sums: 1+6=7 (no), 2+3=5 ✓',
        formula: 'x² + 5x + 6 = (x + 2)(x + 3)',
      },
      {
        title: 'Apply zero product property',
        body: 'Set each factor to zero and solve for x.',
        formula: 'x + 2 = 0 → x = -2 \nx + 3 = 0 → x = -3',
      },
      {
        title: 'Verify your answers',
        body: 'Substitute x = -2 and x = -3 back into the original equation to confirm both satisfy it.',
        formula: '',
      },
    ].map((step, i) => (
      <div
        key={i}
        style={{
          display: 'flex',
          gap: 14,
          paddingBottom: 18,
          borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
          marginBottom: i < 3 ? 18 : 0,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
            background: i === 0 ? 'var(--mod-study)' : 'var(--bg-subtle)',
            color: i === 0 ? 'var(--text-inv)' : 'var(--text-3)',
            border: i === 0 ? 'none' : '1px solid var(--border)',
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </div>
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--text-1)',
              marginBottom: 6,
            }}
          >
            {step.title}
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)', margin: 0 }}>
            {step.body}
          </p>
          {step.formula && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--mod-study)',
                marginTop: 8,
                whiteSpace: 'pre-line',
              }}
            >
              {step.formula}
            </p>
          )}
        </div>
      </div>
    ))}
  </>
)

export default function StudyMatePage() {
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
    <div className="chat-workspace" data-module="study">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-scroll-inner">
          {!hasStarted && (
            <div className="chat-empty">
              <div
                className="chat-module-icon"
                style={{ background: 'var(--mod-study-bg)', borderColor: 'var(--mod-study-border)' }}
              >
                📚
              </div>
              <h1 className="chat-module-title">What are we learning today?</h1>
              <p className="chat-module-tagline">
                Break down complex concepts, solve problems, or prepare for exams with your personal
                AI tutor.
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
                  <AIMessage
                    key={i}
                    content={m.content}
                    emoji="📚"
                    moduleColor="var(--mod-study)"
                  />
                )
              )}
              {loading && <AIThinking emoji="📚" />}
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
              placeholder="Ask a question, paste a problem, or describe what you want to learn..."
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
                <button className="chat-tool-btn" aria-label="Attach image">
                  <ImagePlus size={17} />
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
            StudyMate guides learning. Double-check answers with your course material.
          </p>
        </div>
      </div>
    </div>
  )
}
