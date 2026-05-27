# WriteRight Production Hardening Sprint — WALKTHROUGH

> **Sprint completed**: 2026-05-27  
> **Gate checks**: `tsc --noEmit` ✅ · `cargo check` ✅ · `py_compile` ✅

---

## Summary

Full production hardening across all layers of the WriteRight feature. Zero stubs,
zero TODOs, every file completely implemented. All security invariants enforced.

---

## Files Modified or Created

### TypeScript / Next.js Layer

| File | Change |
|------|--------|
| `types/writeright.ts` | `UIPreferences` extended with `focusModeEnabled` and `grammarScanEnabled` fields |
| `hooks/useWritingPreferences.ts` | `DEFAULT_PREFERENCES.uiPreferences` updated to include both new fields |
| `app/dashboard/writing/page.tsx` | Removed `as Record<string, unknown>` casts (BUG-01/02 fix); `handleModeChange` no longer clears `chatId` or `messages` — single-session mode switching |
| `app/api/writeright/suggestions/accept/route.ts` | **NEW** — POST endpoint to mark a smart suggestion as accepted; full `auth()`→Zod→Supabase double-scoped update→withErrorHandler/withSpan |
| `app/api/writeright/session-stats/route.ts` | **NEW** — GET endpoint returning today/week counts, avg clarity, streak days, top mode; Redis cache (5 min TTL) with circuit-breaker guard |
| `app/api/writeright/rephrases/route.ts` | **NEW** — POST endpoint for instant rephrasing; per-user rate limit (30/10 min) via `ns()`+`INCR`/`EXPIRE`; proxies to Python worker `/morph`; 15 s `AbortSignal.timeout` |
| `app/api/writeright/preferences/route.ts` | PUT handler upgraded: `UIPreferencesSchema.strict()` now validates `focusModeEnabled` + `grammarScanEnabled`; `PutPreferencesSchema` tightened (`.int().min(1).max(5)` for intensity) |

### Components

| File | Change |
|------|--------|
| `components/dashboard/writeright/CoachBar.tsx` | **Rewritten** — zero Tailwind arbitrary-value brackets; uses only `.wr-coach-*` CSS classes; added tip-cycling button with `useState(tipIdx)` |
| `components/dashboard/writeright/WriteSplitView.tsx` | **Rewritten** — zero Tailwind arbitrary-value brackets; uses only `.wr-split-*` CSS classes; `.wr-split-header-badge` / `.wr-split-header-badge-accent` for column headers |

### CSS Design System

| File | Change |
|------|--------|
| `app/globals.css` | Added 3 new CSS blocks: **Coach Bar** (`.wr-coach-bar`, `.wr-coach-metrics`, `.wr-coach-metric-*`, `.wr-coach-tip-*`, `.coach-good/warn/bad`), **Rephrase Panel** (`.wr-rephrase-*`), **Session Stats Bar** (`.wr-session-bar`, `.wr-session-stat`, `.wr-session-divider`); all include dark mode overrides |

### Python Worker

| File | Change |
|------|--------|
| `python-worker/app/config.py` | Added 4 new `Field()` settings: `enable_smart_suggestions`, `smart_suggestions_max_per_session`, `session_dna_cache_hours`, `rephrase_max_chars` |
| `python-worker/app/services/prompt_builder.py` | Added `SYSTEM_PROMPTS` dict with entries for `"rephrase"`, `"smart_suggestions"`, `"session_dna"` — all respond with strict JSON contracts |
| `python-worker/app/services/queue_consumer.py` | `_STANDARD_MODES` frozenset extended with `"rephrase"`, `"smart_suggestions"`, `"session_dna"` — routed through the standard `process_job()` pipeline |

### Rust Auth Gateway

| File | Change |
|------|--------|
| `rust-auth-gateway/src/models.rs` | Added `ThreadResponse` struct (`thread_id`, `messages: Vec<crate::gmail::GmailEmail>`, `total_count: usize`, `truncated: bool`) |
| `rust-auth-gateway/src/gmail.rs` | Added `fetch_thread_messages()` at line 563: validates `thread_id` ≤ 64 chars / no `..` or `/`, fetches Gmail API, returns ≤ 10 messages, zeroes token before return |

### Database Migrations

| File | Status |
|------|--------|
| `supabase/migrations/0029_writeright_ui_preferences_v2.sql` | Verified complete: `ALTER TABLE` + `UPDATE` backfill for `focusModeEnabled`/`grammarScanEnabled` |
| `supabase/migrations/0030_writeright_smart_suggestions.sql` | Verified complete: `writeright_smart_suggestions` table with RLS + indexes |
| `supabase/migrations/0031_writeright_writing_sessions.sql` | Verified complete: `writeright_writing_sessions` table + `upsert_writing_session()` plpgsql function |

---

## Compilation Gate Results

```
npx tsc --noEmit          → exit 0  (zero errors)
cargo check               → Finished dev profile (3 warnings, zero errors)
python -m py_compile ...  → Python syntax OK
```

---

## Bug Fixes Applied

| Bug | Fix |
|-----|-----|
| BUG-01 | `focusModeEnabled` restoration: removed `as Record<string, unknown>` cast in `page.tsx` |
| BUG-02 | Wrong persistence key (`analyticsOpen` vs `focusModeEnabled`): fixed in `page.tsx` effect |
| BUG-05 | `CoachBar.tsx`: all Tailwind arbitrary-value brackets replaced with `.wr-coach-*` classes |
| BUG-06 | `WriteSplitView.tsx`: all Tailwind arbitrary-value brackets replaced with `.wr-split-*` classes |

---

## Security Invariants Verified

- ✅ `auth()` is the **first call** in every new API route
- ✅ All errors use `createApiError()` — never raw `new Error()`
- ✅ All Redis keys use `ns()` namespacing
- ✅ `isCircuitOpen()` guard before every Redis operation
- ✅ All Supabase queries include `.eq("clerk_user_id", userId)` row-level filter
- ✅ `withErrorHandler + withSpan` wrapping on all routes
- ✅ Input validated with Zod `.safeParse()` — never `.parse()` (which throws)
- ✅ Zero `any` types in new routes
- ✅ Gmail thread_id validated (≤ 64 chars, no `..` or `/`) before API call
- ✅ Plaintext OAuth tokens never leave `gmail.rs` module scope
- ✅ Rephrase rate limit uses atomic `INCR`/`EXPIRE` via `ns()` key
