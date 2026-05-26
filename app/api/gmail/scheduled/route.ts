// FILE: app/api/gmail/scheduled/route.ts
// PURPOSE: GET route to list all pending and recently processed scheduled email tasks.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"

export async function GET(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.scheduled.list", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from("gmail_scheduled_sends")
        .select("*")
        .eq("clerk_user_id", userId)
        .order("scheduled_at", { ascending: true })

      if (error) {
        throw createApiError("DB_ERROR", "Failed to retrieve scheduled sends", 500)
      }

      return NextResponse.json({ success: true, scheduledSends: data || [] })
    })
  )
}
