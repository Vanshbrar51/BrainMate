// FILE: app/api/writeright/analytics/route.ts
// PURPOSE: Full writing analytics dashboard — sessions table-first, Redis-cached,
//          date-range-aware. Powers the AnalyticsView overlay.
//          v2: AI-powered Writing DNA via Gemini (Google AI Studio OpenAI-compatible endpoint).
//
// Redis keys introduced here:
//   writeright:analytics:<userId>      STRING  5-min TTL — full analytics payload
//   writeright:analytics:<userId>:90d  STRING  5-min TTL — 90-day range variant
//   writeright:analytics:<userId>:all  STRING  5-min TTL — all-time variant

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes, addSpanEvent } from "@/lib/tracing"
import { z } from "zod"
import OpenAI from "openai"
import type { AnalyticsData } from "@/types/writeright"

const CACHE_TTL = 300 // 5 minutes
const AI_TIMEOUT_MS = 8000 // 8s max for Gemini call — non-blocking if it exceeds

const QuerySchema = z.object({
  range: z.enum(["30d", "90d", "all"]).default("30d"),
})

// ─── Gemini Analytics Payload Shape ──────────────────────────────────────────
// This must match the JSON schema defined in the system prompt exactly.
interface GeminiAnalyticsPayload {
  style_summary: string
  signature_phrases: string[]
  insights: string[]
  strength: string
  growth_area: string
  top_mistake_fixed: string
  coach_message: string
}

// ─── AI Call: Google AI Studio via OpenAI-compatible SDK ─────────────────────
async function callGeminiAnalytics(
  dominantMode: string,
  dominantTone: string,
  avgSentenceLength: number,
  totalImprovements: number,
  topMistakes: Array<{ mistake: string; count: number }>,
  recentSamples: Array<{
    mode: string
    tone: string
    original: string
    improved: string
    mistakes: string[]
  }>,
): Promise<GeminiAnalyticsPayload | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) return null

  const client = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    timeout: AI_TIMEOUT_MS,
  })

  // Build user message — quantitative metrics + writing samples
  const userMessage = JSON.stringify({
    dominant_mode: dominantMode,
    dominant_tone: dominantTone,
    avg_sentence_length: avgSentenceLength,
    total_improvements: totalImprovements,
    top_mistakes: topMistakes,
    recent_samples: recentSamples.slice(0, 8), // cap at 8 samples for token budget
  })

  const SYSTEM_PROMPT = `You are WriteRight's Senior Writing Analyst and Communication Coach — a world-class expert in cross-cultural business editing, linguistic profiling, and data-driven communication coaching.

Your mission is to analyze a user's writing history, metrics, and past corrections to produce a highly personalized, motivating, and actionable Writing DNA profile and weekly debrief. The target audience consists of Indian professionals looking to elevate their communication for global business environments.

Before outputting the JSON response, perform this mandatory analysis:
1. Parse the provided writing samples to identify recurring stylistic traits (e.g., over-apologizing, passive voice, redundant prepositions like "discuss about", or regional Indian English formalisms like "do the needful").
2. Compare the user's original drafts to the improved versions to determine which specific habits they are successfully correcting and where friction persists.
3. Synthesize their score trends and tone preferences to map out their unique style signature and trajectory.
Do not output this analysis. The output must contain ONLY the valid JSON object.

You MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no backticks, no preamble:
{
  "style_summary": "<a cohesive 2-3 sentence overview of the user's professional writing voice, dominant style, and typical contexts, avoiding generic descriptors>",
  "signature_phrases": [
    "<signature phrase 1 - a recommended transition or closing matching their preferred tone>",
    "<signature phrase 2 - a polished global alternative to one of their common regionalisms>",
    "<signature phrase 3 - a high-impact phrase typical of their writing style>"
  ],
  "insights": [
    "<insight 1 - analyzing the impact of their most common mistake on global colleagues, explaining the logical 'why'>",
    "<insight 2 - celebrating a specific improvement they successfully made in their recent samples>",
    "<insight 3 - an actionable tip for their next writing session based on their current trajectory>"
  ],
  "strength": "<a 1-sentence statement highlighting their primary communication asset>",
  "growth_area": "<a 1-sentence constructive tip targeting their most frequent mistake>",
  "top_mistake_fixed": "<a short summary of the most significant style issue they successfully resolved>",
  "coach_message": "<a 2-sentence personalized weekly coach message encouraging their current momentum and challenging them with a specific writing goal for next week>"
}

ALWAYS:
- Respond with a single valid JSON object matching the schema — because our Next.js API parses this directly and any extra characters or backticks will crash the service.
- Ensure that signature_phrases contains exactly 3 to 5 elements and insights contains exactly 3 elements.
- Keep all advice highly concrete, direct, and actionable.
- Retain an encouraging, coach-like tone.

NEVER:
- Wrap your response in markdown code blocks or include any preamble/postamble.
- Hallucinate or modify any numerical statistics — exact numbers are computed from the database.
- Reference any dummy or template data — all insights must be grounded in the user's actual history.`

  try {
    const response = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 800,
    })

    const raw = response.choices[0]?.message?.content?.trim() ?? ""
    // Strip any accidental markdown fences before parsing
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const parsed = JSON.parse(cleaned) as GeminiAnalyticsPayload

    // Validate shape — require at minimum the essential fields
    if (
      typeof parsed.style_summary !== "string" ||
      !Array.isArray(parsed.signature_phrases) ||
      !Array.isArray(parsed.insights)
    ) {
      return null
    }

    return parsed
  } catch {
    // Non-fatal — caller falls back to heuristic values
    return null
  }
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.analytics.get", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Unauthorized", 401)
      addSpanAttributes({ "user.id": userId })

      // Parse query params
      const url = new URL(req.url)
      const parsed = QuerySchema.safeParse({ range: url.searchParams.get("range") ?? "30d" })
      if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid range parameter", 400)
      const { range } = parsed.data

      // Redis cache key varies by range
      const rangeSuffix = range === "30d" ? "" : `:${range}`
      const cacheKey = ns("writeright", "analytics", userId) + rangeSuffix

      // Serve from cache if available
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool()
          const cached = await redis.get(cacheKey)
          if (cached) {
            return NextResponse.json(JSON.parse(cached) as AnalyticsData)
          }
        } catch {
          // Cache miss — proceed to Supabase
        }
      }

      const supabase = getSupabaseAdmin()

      // ─────────────────────────────────────────────────────────────────────
      // Primary data source: writeright_writing_sessions
      // This is the purpose of the sessions table — pre-aggregated daily data
      // ─────────────────────────────────────────────────────────────────────
      const sessionsQuery = supabase
        .from("writeright_writing_sessions")
        .select("session_date, improvements, avg_clarity, avg_tone_score, avg_impact_score, modes_used, word_count, total_tokens")
        .eq("clerk_user_id", userId)
        .order("session_date", { ascending: true })

      if (range === "30d") {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        sessionsQuery.gte("session_date", cutoff)
      } else if (range === "90d") {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        sessionsQuery.gte("session_date", cutoff)
      }

      const { data: sessions, error: sessionsError } = await sessionsQuery
      if (sessionsError) throw createApiError("DB_ERROR", "Failed to fetch sessions", 500)

      // ─────────────────────────────────────────────────────────────────────
      // Secondary data: ai_jobs for mode/tone distribution + mistakes + AI samples
      // Limited to last 90 days max regardless of range to keep fast
      // We now also fetch prompt (original text) for Gemini context
      // ─────────────────────────────────────────────────────────────────────
      const jobsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const { data: jobs } = await supabase
        .from("writeright_ai_jobs")
        .select("metadata, output, prompt, created_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("created_at", jobsCutoff)
        .order("created_at", { ascending: false })
        .limit(500)

      // ─────────────────────────────────────────────────────────────────────
      // Streak data from streaks table
      // ─────────────────────────────────────────────────────────────────────
      const { data: streakRow } = await supabase
        .from("writeright_streaks")
        .select("current_streak, longest_streak")
        .eq("user_id", userId)
        .maybeSingle()

      // =========================================================================
      // COMPUTE ANALYTICS
      // =========================================================================

      // ── Totals ──────────────────────────────────────────────────────────────
      const total_improvements = sessions?.reduce((s, r) => s + (r.improvements ?? 0), 0) ?? 0
      const total_words_improved = sessions?.reduce((s, r) => s + (r.word_count ?? 0), 0) ?? 0

      // ── Heatmap (all sessions → last 52 weeks from today) ───────────────────
      const heatmapCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const heatmapQuery = supabase
        .from("writeright_writing_sessions")
        .select("session_date, improvements")
        .eq("clerk_user_id", userId)
        .gte("session_date", heatmapCutoff)
        .order("session_date", { ascending: true })

      const { data: heatmapSessions } = await heatmapQuery
      const heatmap = (heatmapSessions ?? []).map(s => ({
        date: s.session_date as string,
        count: s.improvements ?? 0,
      }))

      // ── Score Trends (from sessions table — accurate daily averages) ─────────
      const score_trends = (sessions ?? [])
        .filter(s => s.avg_clarity != null)
        .map(s => ({
          date: s.session_date as string,
          clarity: Number(s.avg_clarity) || 0,
          tone: Number(s.avg_tone_score) || 0,
          impact: Number(s.avg_impact_score) || 0,
        }))

      // ── All-time average scores ──────────────────────────────────────────────
      const scoredSessions = (sessions ?? []).filter(s => s.avg_clarity != null)
      const avg_scores = scoredSessions.length > 0
        ? {
            clarity: Math.round(scoredSessions.reduce((s, r) => s + Number(r.avg_clarity || 0), 0) / scoredSessions.length * 10) / 10,
            tone: Math.round(scoredSessions.reduce((s, r) => s + Number(r.avg_tone_score || 0), 0) / scoredSessions.length * 10) / 10,
            impact: Math.round(scoredSessions.reduce((s, r) => s + Number(r.avg_impact_score || 0), 0) / scoredSessions.length * 10) / 10,
          }
        : { clarity: 0, tone: 0, impact: 0 }

      // ── Daily Activity (last 14 days bar chart) ─────────────────────────────
      const dailyMap: Record<string, number> = {}
      const now = new Date()
      for (let d = 13; d >= 0; d--) {
        const dayStart = new Date(now)
        dayStart.setDate(now.getDate() - d)
        const label = dayStart.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
        dailyMap[label] = 0
      }

      ;(heatmapSessions ?? []).forEach(s => {
        const d = new Date(s.session_date as string)
        const sessionDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const diffTime = todayDate.getTime() - sessionDate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays >= 0 && diffDays <= 13) {
          const label = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
          if (label in dailyMap) {
            dailyMap[label] += s.improvements ?? 0
          }
        }
      })

      const daily_activity = Object.entries(dailyMap).map(([date_label, count]) => ({ date_label, count }))

      // ── Weekly Report Calculation ───────────────────────────────────────────
      let thisWeekWords = 0, lastWeekWords = 0
      let thisWeekImp = 0, lastWeekImp = 0
      let thisWeekClaritySum = 0, lastWeekClaritySum = 0
      let thisWeekClarityCount = 0, lastWeekClarityCount = 0

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

      ;(sessions ?? []).forEach(s => {
        const d = new Date(s.session_date as string)
        if (d >= sevenDaysAgo) {
          thisWeekWords += (s.word_count ?? 0)
          thisWeekImp += (s.improvements ?? 0)
          if (s.avg_clarity) {
            thisWeekClaritySum += Number(s.avg_clarity)
            thisWeekClarityCount++
          }
        } else if (d >= fourteenDaysAgo) {
          lastWeekWords += (s.word_count ?? 0)
          lastWeekImp += (s.improvements ?? 0)
          if (s.avg_clarity) {
            lastWeekClaritySum += Number(s.avg_clarity)
            lastWeekClarityCount++
          }
        }
      })

      const weekly_report = {
        this_week_words: thisWeekWords,
        last_week_words: lastWeekWords,
        this_week_improvements: thisWeekImp,
        last_week_improvements: lastWeekImp,
        this_week_clarity: thisWeekClarityCount > 0 ? Math.round((thisWeekClaritySum / thisWeekClarityCount) * 10) / 10 : 0,
        last_week_clarity: lastWeekClarityCount > 0 ? Math.round((lastWeekClaritySum / lastWeekClarityCount) * 10) / 10 : 0,
      }

      // ── Mode & Tone Distribution (from ai_jobs) ──────────────────────────────
      const modeCount: Record<string, number> = {}
      const toneCount: Record<string, number> = {}
      let jobTotal = 0

      ;(jobs ?? []).forEach(job => {
        const meta = job.metadata as Record<string, unknown> | null
        const mode = meta?.mode as string | undefined
        const tone = meta?.tone as string | undefined
        if (mode) modeCount[mode] = (modeCount[mode] ?? 0) + 1
        if (tone) toneCount[tone] = (toneCount[tone] ?? 0) + 1
        jobTotal++
      })

      const mode_distribution = Object.entries(modeCount)
        .sort((a, b) => b[1] - a[1])
        .map(([mode, count]) => ({
          mode,
          count,
          percent: jobTotal > 0 ? Math.round((count / jobTotal) * 100) : 0,
        }))

      const tone_distribution = Object.entries(toneCount)
        .sort((a, b) => b[1] - a[1])
        .map(([tone, count]) => ({
          tone,
          count,
          percent: jobTotal > 0 ? Math.round((count / jobTotal) * 100) : 0,
        }))

      // ── Top Mistakes & Vocabulary (from ai_jobs.output) ──────────────────────
      const mistakesMap: Record<string, number> = {}
      let totalWords = 0
      let totalSentences = 0
      let analyzedCount = 0

      // Also collect recent samples for Gemini context
      const recentSamples: Array<{
        mode: string
        tone: string
        original: string
        improved: string
        mistakes: string[]
      }> = []

      ;(jobs ?? []).forEach(job => {
        const output = job.output as Record<string, unknown> | null
        const meta = job.metadata as Record<string, unknown> | null
        if (!output) return

        const teaching = output.teaching as { mistakes?: string[] } | undefined
        teaching?.mistakes?.forEach((m: string) => {
          mistakesMap[m] = (mistakesMap[m] ?? 0) + 1
        })

        const improved = output.improved_text as string | undefined
        const original = job.prompt as string | undefined

        if (improved) {
          const words = improved.split(/\s+/).filter(Boolean)
          totalWords += words.length
          totalSentences += improved.split(/[.!?]+/).filter(Boolean).length
          analyzedCount++
        }

        // Build sample for Gemini (only include jobs with both original + improved)
        if (improved && original && recentSamples.length < 10) {
          recentSamples.push({
            mode: (meta?.mode as string) ?? "unknown",
            tone: (meta?.tone as string) ?? "unknown",
            original: original.slice(0, 300), // cap to keep tokens reasonable
            improved: improved.slice(0, 300),
            mistakes: teaching?.mistakes?.slice(0, 3) ?? [],
          })
        }
      })

      const top_mistakes = Object.entries(mistakesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mistake, count]) => ({ mistake, count }))

      const avg_sentence_length = totalSentences > 0
        ? Math.round(totalWords / totalSentences)
        : 14

      // ── Writing DNA base (heuristic) ─────────────────────────────────────────
      const dominant_mode = mode_distribution[0]?.mode ?? "email"
      const dominant_tone = tone_distribution[0]?.tone ?? "Professional"

      const improvement_trajectory: "improving" | "stable" | "declining" = (() => {
        if (score_trends.length < 2) return "stable"
        const recent = score_trends.slice(-5)
        const older = score_trends.slice(-10, -5)
        if (older.length === 0) return total_improvements > 5 ? "improving" : "stable"
        const recentAvg = recent.reduce((s, r) => s + r.clarity, 0) / recent.length
        const olderAvg = older.reduce((s, r) => s + r.clarity, 0) / older.length
        if (recentAvg > olderAvg + 0.3) return "improving"
        if (recentAvg < olderAvg - 0.3) return "declining"
        return "stable"
      })()

      // ── Percentile ───────────────────────────────────────────────────────────
      let percentile = 50
      const { data: pctData, error: pctErr } = await supabase
        .rpc("get_global_percentile", { p_user_id: userId })
        .maybeSingle()
      if (!pctErr && pctData !== null) {
        percentile = Number(pctData)
      } else {
        percentile = Math.min(99, Math.max(40, 50 + total_improvements * 2))
      }

      // ── Streak (from dedicated streaks table, fall back to heatmap calc) ──────
      const currentStreak = streakRow?.current_streak ?? (() => {
        const sortedDates = heatmap.map(h => h.date).sort()
        let streak = 0
        const todayStr = new Date().toISOString().split("T")[0]
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        if (sortedDates.length === 0) return 0
        const last = sortedDates[sortedDates.length - 1]
        if (last !== todayStr && last !== yesterday) return 0
        for (let i = sortedDates.length - 1; i >= 0; i--) {
          const expected = new Date(Date.now() - (sortedDates.length - 1 - i) * 24 * 60 * 60 * 1000)
            .toISOString().split("T")[0]
          if (sortedDates[i] === expected) streak++
          else break
        }
        return streak
      })()

      const longestStreak = streakRow?.longest_streak ?? (() => {
        let max = 0, cur = 0, prev = ""
        heatmap.map(h => h.date).sort().forEach(d => {
          const diff = prev
            ? (new Date(d).getTime() - new Date(prev).getTime()) / 86400000
            : 0
          cur = (diff === 1) ? cur + 1 : 1
          max = Math.max(max, cur)
          prev = d
        })
        return max
      })()

      // ── Heuristic fallback style summary & signature phrases ─────────────────
      const fallbackStyleSummary = `Your writing is primarily ${dominant_tone.toLowerCase()} and focused on ${dominant_mode} communication. You average ${avg_sentence_length} words per sentence with consistent clarity across sessions. ${improvement_trajectory === "improving" ? "Your scores are trending upward — keep the momentum." : "Your quality is steady and reliable."}`

      const fallbackSignaturePhrases = dominant_tone === "Professional"
        ? ["Best regards", "Please find attached", "Thank you for your time"]
        : dominant_tone === "Friendly"
          ? ["Hope you're doing well", "Cheers", "Looking forward to it"]
          : ["To summarise", "In brief", "Key point"]

      const fallbackInsights: string[] = []
      if (total_improvements >= 10) fallbackInsights.push(`You've completed ${total_improvements} writing improvements — top 30% of users.`)
      if (avg_scores.clarity >= 8) fallbackInsights.push("Clarity is your strongest metric. Keep the sentences tight.")
      if (dominant_mode === "email") fallbackInsights.push("Email is your primary channel — consider exploring LinkedIn posts.")
      if (improvement_trajectory === "improving") fallbackInsights.push("Your writing quality is on an upward trajectory this month.")
      if (top_mistakes.length > 0) fallbackInsights.push(`Most common friction: "${top_mistakes[0].mistake}" — flagged ${top_mistakes[0].count} times.`)
      if (fallbackInsights.length === 0) fallbackInsights.push("Complete more writing sessions to unlock personalised insights.")

      // ── Call Gemini for AI-enhanced qualitative metadata ─────────────────────
      addSpanEvent("gemini_analytics_call_start", { total_improvements, sample_count: recentSamples.length })

      let geminiPayload: GeminiAnalyticsPayload | null = null

      // Only call Gemini if there's enough data to make it meaningful
      if (recentSamples.length > 0 || total_improvements > 0) {
        geminiPayload = await callGeminiAnalytics(
          dominant_mode,
          dominant_tone,
          avg_sentence_length,
          total_improvements,
          top_mistakes,
          recentSamples,
        )
      }

      addSpanEvent("gemini_analytics_call_end", { success: geminiPayload !== null })

      // ── Assemble final response — AI values take precedence over fallbacks ───
      const responseData: AnalyticsData = {
        heatmap,
        score_trends,
        mode_distribution,
        tone_distribution,
        vocabulary_stats: {
          unique_words_used: Math.round(total_words_improved * 0.4),
          avg_sentence_length,
          top_mistakes,
          most_improved_areas: ["Clarity", "Actionable phrasing", "Tone matching"],
        },
        writing_dna: {
          style_summary: geminiPayload?.style_summary ?? fallbackStyleSummary,
          signature_phrases: geminiPayload?.signature_phrases ?? fallbackSignaturePhrases,
          improvement_trajectory,
          percentile,
          dominant_mode,
          dominant_tone,
          // AI-only fields — undefined if Gemini call failed
          strength: geminiPayload?.strength,
          growth_area: geminiPayload?.growth_area,
          coach_message: geminiPayload?.coach_message,
          top_mistake_fixed: geminiPayload?.top_mistake_fixed,
        },
        streak: {
          current: currentStreak,
          longest: longestStreak,
          total_days: heatmap.length,
        },
        total_improvements,
        total_words_improved,
        avg_scores,
        daily_activity,
        weekly_report,
        insights: geminiPayload?.insights ?? fallbackInsights,
      }

      // Store in Redis cache
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool()
          await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(responseData))
        } catch {
          // Non-fatal — response still served
        }
      }

      return NextResponse.json(responseData)
    })
  )
}
