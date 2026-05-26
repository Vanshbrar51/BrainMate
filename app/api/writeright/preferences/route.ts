// FILE: app/api/writeright/preferences/route.ts
// PURPOSE: Manage persistent user preferences (Tone, Mode, CoachBar toggle, etc.)

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PreferenceSchema = z.object({
  preferredTone: z.enum(['Professional', 'Friendly', 'Concise', 'Academic', 'Assertive']),
  preferredMode: z.enum(['email', 'paragraph', 'linkedin', 'whatsapp']),
  preferredIntensity: z.number().min(1).max(3),
  preferredOutputLang: z.enum(['en', 'hindi', 'tamil', 'marathi', 'bengali', 'telugu']),
  favouriteChips: z.array(z.string()).max(5),
  uiPreferences: z.object({
    sidebarOpen: z.boolean(),
    analyticsOpen: z.boolean(),
    coachBarEnabled: z.boolean(),
    splitViewDefault: z.boolean()
  })
})

const DEFAULT_PREFERENCES = {
  preferredTone: "Professional",
  preferredMode: "email",
  preferredIntensity: 1,
  preferredOutputLang: "en",
  favouriteChips: [],
  uiPreferences: {
    sidebarOpen: true,
    analyticsOpen: false,
    coachBarEnabled: true,
    splitViewDefault: false
  }
}

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.preferences.get", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Unauthorized", 401)
      addSpanAttributes({ "user.id": userId })

      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from("writeright_user_settings")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle()

      if (error) {
        throw createApiError("DB_ERROR", "Failed to retrieve user preferences", 500)
      }

      const preferences = (data && data.preferences && Object.keys(data.preferences).length > 0)
        ? data.preferences
        : DEFAULT_PREFERENCES

      return NextResponse.json({ success: true, preferences })
    })
  )
}

// ---------------------------------------------------------------------------
// PUT Handler
// ---------------------------------------------------------------------------

export async function PUT(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.preferences.put", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Unauthorized", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON format", 400)
      }

      const parsed = PreferenceSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Validation failed for preferences", 400, { issues: parsed.error.issues })
      }

      const supabase = getSupabaseAdmin()
      const { error } = await supabase
        .from("writeright_user_settings")
        .upsert({
          user_id: userId,
          preferences: parsed.data,
          updated_at: new Date().toISOString()
        })

      if (error) {
        throw createApiError("DB_ERROR", "Failed to persist user preferences", 500)
      }

      return NextResponse.json({ success: true })
    })
  )
}
