// FILE: app/api/writeright/templates/suggest/route.ts
// PURPOSE: GET route returning contextual template suggestion chips based on the user's last 10 messages.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import type { WritingMode, ToneOption } from "@/types/writeright"

export async function GET(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.templates.suggest", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      const supabase = getSupabaseAdmin()
      // Fetch last 10 user message metadata to inspect modes/tones used
      const { data: messages, error } = await supabase
        .from("writeright_messages")
        .select("metadata")
        .eq("user_id", userId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(10)

      if (error) {
        throw createApiError("DB_ERROR", "Failed to retrieve logs for suggestions", 500)
      }

      // Analyze modes and tones
      const modeCount: Record<string, number> = {}
      const toneCount: Record<string, number> = {}

      messages?.forEach(msg => {
        const meta = msg.metadata as Record<string, unknown> | null
        if (meta) {
          const mode = meta.mode
          const tone = meta.tone
          if (typeof mode === 'string') modeCount[mode] = (modeCount[mode] || 0) + 1
          if (typeof tone === 'string') toneCount[tone] = (toneCount[tone] || 0) + 1
        }
      })

      const dominantMode = (Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'email') as WritingMode
      const dominantTone = (Object.entries(toneCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Professional') as ToneOption

      // Suggestions builder
      const suggestions = [
        {
          message: `You frequently write ${dominantMode === 'email' ? 'emails' : dominantMode} with a ${dominantTone} tone. Would you like a template for that?`,
          mode: dominantMode,
          tone: dominantTone
        }
      ]

      // Add fallbacks to make it 2-3 suggestions
      if (dominantMode !== 'email') {
        suggestions.push({
          message: `Create a professional email draft template.`,
          mode: 'email' as WritingMode,
          tone: 'Professional' as ToneOption
        })
      } else {
        suggestions.push({
          message: `Create a friendly LinkedIn pitch template.`,
          mode: 'linkedin' as WritingMode,
          tone: 'Friendly' as ToneOption
        })
      }

      suggestions.push({
        message: `Create a concise WhatsApp message template.`,
        mode: 'whatsapp' as WritingMode,
        tone: 'Concise' as ToneOption
      })

      return NextResponse.json({ success: true, suggestions })
    })
  )
}
