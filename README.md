# BrainMate AI

Enterprise-grade landing experience with secure authentication:
- `Next.js` frontend with `Clerk` auth (sign-in/sign-up, protected dashboard)
- `Rust + Axum` auth gateway that validates Clerk JWTs via JWKS

## Implemented Features

- Special navbar with `Landing`, `Pricing`, and auth-aware actions
  - Signed out: `Get Started`
  - Signed in: `Dashboard` + `Sign out`
- Premium Clerk auth pages:
  - `/sign-in`
  - `/sign-up`
- Route protection using Clerk middleware:
  - `/dashboard` is protected
- Dashboard placeholder (no product dashboard yet) with session verification status
- Rust auth gateway with:
  - Bearer token parsing and strict validation
  - Per-IP rate limiting on protected routes
  - Structured audit logs (`target="audit"`)
  - Clerk JWKS signature verification (RS256)
  - JWKS refresh lock to prevent thundering-herd refresh storms
  - Issuer/audience/authorized-party policy checks
  - Startup validation for issuer/JWKS URL safety
  - Live/readiness probes with JWKS dependency status
  - Security headers, CORS, timeout, tracing
  - Endpoints:
    - `GET /healthz/live`
    - `GET /healthz/ready`
    - `GET /v1/auth/session`

## Project Structure

- `app/` - Next.js app router pages
- `components/` - UI and landing components
- `proxy.ts` - Clerk route protection
- `rust-auth-gateway/` - Axum auth gateway

## Environment Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Fill Clerk values in `.env`:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWKS_URL`
- `CLERK_ISSUER`

3. Keep:
- `RUST_AUTH_API_URL=http://localhost:8081` (or your gateway URL)

## Run Next.js App

```bash
npm install
npm run dev
```

Frontend runs on [http://localhost:3000](http://localhost:3000)

## Run Rust Auth Gateway

```bash
set -a; source .env; set +a
cargo run --manifest-path rust-auth-gateway/Cargo.toml
```

Gateway runs on `AUTH_GATEWAY_BIND_ADDR` (default `0.0.0.0:8081`)

## Security Notes

- Protected frontend routes require Clerk session (`proxy.ts`)
- Protected backend route requires valid Clerk JWT signed by Clerk JWKS
- Configure `CLERK_AUDIENCE` and `CLERK_AUTHORIZED_PARTY` for stricter token policy
- Keep `CLERK_SECRET_KEY` server-only

## Production Deployment Checklist

Before deploying to production, verify every item:

### TLS
- [ ] Set `REQUIRE_TLS=true`
- [ ] Set `TLS_CERT_PATH` to valid cert (fullchain.pem)
- [ ] Set `TLS_KEY_PATH` to valid private key
- [ ] Set `ENFORCE_TLS_FOR_PUBLIC_LISTENER=true` — gateway refuses to
      start without certs if the public port is not loopback
- [ ] Set `AUTH_GATEWAY_BIND_ADDR=0.0.0.0:8081` (or your production IP)

### Secrets
- [ ] Set `SECRET_PROVIDER=aws_sm` (or `gcp_sm`)
- [ ] Configure `SM_*` mappings to your cloud secret names
- [ ] Do NOT set `OTP_PEPPER` / `INTERNAL_API_TOKEN` in plaintext env
- [ ] Rotate `CLERK_SECRET_KEY` if it was ever in version control
- [ ] Rotate `REDIS_URL` password if it was ever in version control

### Geo / Risk
- [ ] If using Cloudflare: CF-IPCountry header is sent automatically.
      Risk engine will use country-change detection immediately.
- [ ] If using Cloudflare Enterprise: CF-IPLatitude / CF-IPLongitude
      are sent automatically. Full impossible-travel scoring is active.
- [ ] Set `CLERK_AUTHORIZED_PARTY` to your production domain
      (e.g. https://app.yourdomain.com)

### Reconciliation
- [ ] Set `ENABLE_RECONCILIATION_WORKER=true` in production
      (or run the TypeScript worker as a separate process)
- [ ] Monitor `reconciliation_dlq_total` metric in Prometheus.
      DLQ growth means persistent failures requiring manual review.

### Redis
- [ ] Configure Redis Sentinel or Cluster for HA
- [ ] Set `REDIS_PRIMARY_URL` to your primary instance
- [ ] Enable Redis AUTH password
- [ ] Enable Redis TLS (`rediss://` scheme in `REDIS_URL` / `REDIS_PRIMARY_URL` for any non-localhost deployment)

### Monitoring
- [ ] Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector
- [ ] Set `OTEL_DEPLOYMENT_ENVIRONMENT=production`
- [ ] Set `OTEL_BASE_SAMPLE_RATIO=0.05` (5% in high-traffic production)
- [ ] Alert on: `risk_assessment_total{level="critical"} > 10 per minute`
- [ ] Alert on: `reconciliation_dlq_total` increasing
- [ ] Alert on: `auth_degraded_mode_total` increasing

You are an expert Next.js + TypeScript frontend engineer building a production-grade dashboard page for BrainMate AI — a SaaS product with a carefully designed design system. Your job is to produce a single file: `app/dashboard/writing/page.tsx`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL: DESIGN SYSTEM — READ EVERY LINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The project uses a custom CSS design system defined in globals.css. You MUST use these CSS variables and class names — never use hardcoded hex colors, never invent new classes.

── CSS VARIABLES (use these, never hex) ──

Surfaces:
  --bg           → page background (warm cream / dark near-black)
  --bg-subtle    → slightly deeper surface
  --bg-warm      → hover states, nested panels
  --surface      → cards, modals (pure white / dark card)
  --surface-2    → nested within cards

Borders:
  --border       → default border (8% opacity)
  --border-med   → medium emphasis border
  --border-warm  → warm-tinted border for nav/hero
  --border-strong → strong border

Text:
  --text-1       → primary text (warm near-black / warm off-white)
  --text-2       → secondary body text
  --text-3       → muted captions, labels, placeholders
  --text-inv     → text on dark backgrounds

Accent (Anthropic terracotta):
  --accent           → #C4622D (light) / #D4724A (dark)
  --accent-hover     → darker hover
  --accent-subtle    → 8% opacity accent fill
  --accent-border    → 18% opacity accent border
  --accent-muted     → muted accent text

WriteRight module accent (purple):
  --mod-write        → #7A4F7D (light) / #9A6F9D (dark)
  --mod-write-bg     → rgba(122,79,125,0.08)
  --mod-write-border → rgba(122,79,125,0.18)

Shadows:
  --shadow-xs / --shadow-sm / --shadow-md / --shadow-lg / --shadow-hero

Radii:
  --r-sm (6px) / --r-md (12px) / --r-lg (18px) / --r-xl (24px) / --r-2xl (32px)

Typography:
  --font-display → Instrument Serif (headings, italic)
  --font-body    → Geist sans (body, UI)
  --font-mono    → Geist mono (code)

Transitions:
  --transition-fast (130ms) / --transition-base (260ms) / --transition-slow (440ms)
  --ease-out-expo → cubic-bezier(0.16, 1, 0.3, 1)

Semantic:
  --success / --error / --warning
  --panel-bg / --panel-text / --panel-muted → for dark inverted sections

── PRE-BUILT CSS CLASSES (use these, don't recreate) ──

Shell:
  .chat-workspace           → main column flex container, full height
  .chat-workspace[data-module="write"] → adds 2px purple top border (identity stripe)

Scroll area:
  .chat-scroll              → flex:1, overflow-y auto, padding-bottom 180px
  .chat-scroll-inner        → max-width 768px, centered, padding 48px 24px 0

Empty/landing state:
  .chat-empty               → centered column, text-align center, padding 0 24px
  .chat-module-icon         → 56px rounded icon container
  .chat-module-title        → large serif italic heading
  .chat-module-tagline      → 16px muted description, max-width 480px

Capability cards:
  .chat-caps-grid           → 3-col responsive grid
  .chat-cap-card            → white surface card, shadow-xs, 16px radius
  .chat-cap-icon            → 32px circle icon holder
  .chat-cap-title           → 13px 600 weight
  .chat-cap-desc            → 12px muted, line-height 1.5

Prompt chips (2×2 grid):
  .chat-prompts-grid        → 2-col grid, gap 10px
  .chat-prompt-chip         → bg-subtle card, hover bg-warm
  .chat-prompt-chip-title   → 13px 500, flex space-between
  .chat-prompt-chip-sub     → 11.5px muted, truncated

Message thread:
  .chat-messages            → flex column, gap 28px
  .chat-msg-user            → flex justify-end
  .chat-msg-user-bubble     → bg-subtle bubble, border-radius 18px 18px 4px 18px
  .chat-msg-ai              → flex column, gap 4px
  .chat-msg-ai-header       → flex, align center, gap 8px
  .chat-msg-ai-avatar       → 28px rounded square icon
  .chat-msg-ai-label        → 12px 600 muted
  .chat-msg-ai-body         → padded left 36px, 15px, line-height 1.72

Input bar (pinned bottom):
  .chat-input-bar           → absolute bottom, gradient fade, pointer-events passthrough
  .chat-input-bar-inner     → max-width 768px centered
  .chat-input-box           → white surface, border, 22px radius, focus glow
  .chat-textarea            → transparent, no border/outline, resize none, auto-grow
  .chat-input-footer        → flex space-between, padding 8px 10px 10px 14px
  .chat-tools-left / .chat-tools-right → tool button groups
  .chat-tool-btn            → 36px square, ghost hover
  .chat-hint                → 11px mono, muted
  .chat-send-btn            → 36px circle, --text-1 bg, --text-inv icon
  .chat-disclaimer          → 11px centered muted text below input

Tone pills (WriteRight specific):
  .tone-pills               → flex wrap, gap 6px
  .tone-pill                → rounded pill, border, ghost style
  .tone-pill.active         → --text-1 bg, --text-inv color, bold

Utility:
  .chat-insight             → accent left-border callout block
  .chat-code-block          → dark panel code display
  .chat-diff-before         → red left-border diff
  .chat-diff-after          → green left-border diff
  .chat-diff-label          → 10px uppercase label

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXISTING COMPONENT IMPORTS (already built)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Import from '@/components/dashboard/ChatMessage':
  - type Message         → { role: 'user' | 'ai', content: React.ReactNode }
  - UserMessage          → renders user bubble
  - AIMessage            → renders AI response with avatar, accepts: content, emoji, moduleColor
  - AIThinking           → animated thinking dots while loading
  - DiffBlock            → before/after diff display, accepts: before, after, explanation
  - CodeBlock            → dark code block, accepts: code (string)
  - InsightBlock         → accent callout, wraps children

Import lucide-react for icons (already installed):
  Send, Paperclip, FileCode, ArrowUpRight, SpellCheck2, Blend, FileText,
  Mail, MessageSquare, Linkedin, Globe, Zap, Copy, Check, RotateCcw,
  ChevronDown, Languages, Star, Sparkles, Shield, Clock, TrendingUp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE PATTERN (follow this exact structure)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The page file must:
1. Start with 'use client'
2. Use useState, useRef, useCallback from React
3. Follow this JSX structure exactly:

<div className="chat-workspace" data-module="write">
  
  {/* Scrollable message area */}
  <div className="chat-scroll" ref={scrollRef}>
    <div className="chat-scroll-inner">
      
      {/* LANDING STATE — shown when hasStarted === false */}
      {!hasStarted && (
        <div className="chat-empty">
          {/* Module icon */}
          {/* Title: font-display, italic */}
          {/* Tagline */}
          {/* Capability cards grid */}
          {/* [WriteRight ONLY] Mode selector (Email/Paragraph/LinkedIn/WhatsApp) */}
          {/* Prompt suggestion chips 2×2 */}
        </div>
      )}

      {/* CONVERSATION STATE — shown when hasStarted === true */}
      {hasStarted && (
        <div className="chat-messages">
          {/* Map messages → UserMessage or AIMessage */}
          {/* Show AIThinking when loading */}
        </div>
      )}

    </div>
  </div>

  {/* Pinned bottom input bar */}
  <div className="chat-input-bar">
    <div className="chat-input-bar-inner">
      <div className="chat-input-box">
        {/* [WriteRight ONLY] Tone pill row ABOVE textarea */}
        {/* Textarea */}
        {/* Footer: tools-left (attach), tools-right (hint + send) */}
      </div>
      <p className="chat-disclaimer">...</p>
    </div>
  </div>

</div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITERIGHT SPECIFIC FEATURES TO BUILD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WRITING MODE SELECTOR (landing state only)
   Four modes shown as pill tabs above the prompt chips:
   - ✉️ Email
   - 📝 Paragraph  
   - 💼 LinkedIn
   - 💬 WhatsApp → Formal
   
   Active mode changes the placeholder text in the textarea and adjusts
   the prompt chips to be contextually relevant to that mode.
   Store in: const [mode, setMode] = useState<'email'|'paragraph'|'linkedin'|'whatsapp'>('email')

2. TONE SELECTOR (inside input box, above textarea)
   Five tones as .tone-pill buttons:
   Professional / Friendly / Concise / Academic / Assertive
   Store in: const [tone, setTone] = useState('Professional')

3. CAPABILITIES (3 cards):
   - "Indian English fixer" → detects 'kindly revert', 'do the needful', fixes automatically
   - "Tone & clarity" → shift between Professional, Friendly, Concise, Academic
   - "Format for any context" → emails, LinkedIn posts, WhatsApp, reports

4. PROMPT CHIPS (change based on active mode):
   Email mode:
     - "Polish this email draft" / sub: "Improve clarity and professional tone"
     - "Write reply to this email" / sub: "Paste email, get a reply written for you"
     - "Fix Indian English" / sub: 'Remove "kindly revert", "do the needful"'
     - "Make this more formal" / sub: "Upgrade casual email to professional"
   
   LinkedIn mode:
     - "Write a LinkedIn post" / sub: "Turn my idea into an engaging post"
     - "Rewrite this for LinkedIn" / sub: "Make it more professional and engaging"
     - "Add hooks and structure" / sub: "Make it stop the scroll"
     - "Make it less cringe" / sub: "Remove buzzwords and corporate speak"
   
   WhatsApp mode:
     - "Convert WhatsApp to email" / sub: "Turn this chat into a formal email"
     - "Fix Hinglish to English" / sub: "Clean up mixed Hindi-English text"
     - "Make this professional" / sub: "Boss-ready version of this message"
     - "Summarise this thread" / sub: "3-line summary of long chat"
   
   Paragraph mode:
     - "Rewrite this paragraph" / sub: "More concise and impactful"
     - "Fix grammar and flow" / sub: "Correct errors and improve readability"
     - "Make this Academic" / sub: "Formal language for university submission"
     - "Simplify this text" / sub: "Plain English anyone can understand"

5. MOCK AI RESPONSE
   Use DiffBlock for the AI response with a realistic before/after example.
   The 'explanation' prop should be 1-2 sentences explaining the key changes.
   
   Example for email mode:
   before: "I wanted to reach out and ask if you could maybe help me with the project deadline. I think we should probably discuss this soon only."
   after: "I am writing to request your input on the project deadline. Could we schedule a brief call this week to align on next steps?"
   explanation: 'Removed hedging language ("maybe", "I think", "probably") and the Indian English pattern "soon only". The revised version is direct and action-oriented.'

6. SUBMIT FUNCTION
   - Accepts optional text param (for chip clicks) or uses textarea value
   - Sets hasStarted = true
   - Appends UserMessage
   - Shows AIThinking (1300ms delay)
   - Appends AIMessage with MOCK_AI content
   - Auto-scrolls on each state change
   
   Signature: const submit = useCallback(async (text?: string) => { ... }, [input, loading, tone, mode])

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE RULES — NEVER BREAK THESE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ DO:
  - Use ONLY CSS variables for all colors: var(--text-1), var(--surface), etc.
  - Use pre-built class names for all major layout elements
  - Use inline style={{ }} ONLY for dynamic values or module-specific accent colors
  - Use var(--mod-write) and var(--mod-write-bg) for the purple module accent
  - Use var(--font-display) for the module title (serif italic)
  - Use var(--font-mono) for code/hint text
  - Use var(--transition-fast) for hover states
  - Use var(--r-md) / var(--r-lg) for border radii
  - Use var(--shadow-xs) / var(--shadow-sm) for card shadows
  - Keep the module icon styled with mod-write-bg and mod-write-border

❌ NEVER:
  - Never use hardcoded hex colors like #7A4F7D — always use CSS vars
  - Never use Tailwind color classes like text-purple-600 or bg-gray-100
  - Never create new CSS classes — use the pre-built ones
  - Never use arbitrary Tailwind values like w-[56px] — use inline style instead
  - Never add <style> tags — the design system is in globals.css
  - Never use text-white or text-black — use var(--text-1) or var(--text-inv)
  - Never override the chat-workspace, chat-scroll, or chat-input-bar layout

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INLINE STYLE PATTERNS (copy these exactly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Module icon:
  style={{ background: 'var(--mod-write-bg)', borderColor: 'var(--mod-write-border)' }}

Module title:
  style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}

Active mode tab (selected state):
  style={{ background: 'var(--mod-write)', color: 'var(--text-inv)', borderColor: 'var(--mod-write)' }}

Inactive mode tab:
  style={{ background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)' }}

Tone pills row container (above textarea):
  style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}

ArrowUpRight icon in chips:
  style={{ color: 'var(--text-3)', flexShrink: 0 }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Produce ONE complete file: app/dashboard/writing/page.tsx

It must:
- Be a valid Next.js 14 App Router client component
- Have zero TypeScript errors
- Import only from: react, lucide-react, @/components/dashboard/ChatMessage
- Work inside the existing DashboardShell layout (sidebar + main area)
- Be fully functional with the mock AI response
- Handle all 4 modes with correct prompt chips
- Have the tone selector with 5 options
- Auto-grow the textarea on input
- Send on Enter (not Shift+Enter)
- Disable send button when input is empty or loading
- Scroll to bottom after each message

The component name must be: export default function WriteRightPage()

zip -r brainmate-ai.zip . -x "brainmate-ai.zip" "node_modules/*" ".next/*" "target/*" "venv/*" "*/node_modules/*" "*/.next/*" "*/target/*" "*/venv/*"
