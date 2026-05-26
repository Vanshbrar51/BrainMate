// FILE: app/api/gmail/schedule/[id]/route.ts
// PURPOSE: DELETE route to cancel a scheduled email task by updating its status to 'cancelled'.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.schedule.cancel", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      
      const { id } = await params
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        throw createApiError("VALIDATION_ERROR", "Invalid scheduled task ID", 400)
      }

      addSpanAttributes({ "user.id": userId, "gmail.scheduled_send_id": id })

      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from("gmail_scheduled_sends")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("clerk_user_id", userId)
        .select("*")
        .single()

      if (error || !data) {
        if (error?.code === "PGRST116") {
          throw createApiError("NOT_FOUND", "Scheduled send task not found", 404)
        }
        throw createApiError("DB_ERROR", "Failed to cancel scheduled send", 500)
      }

      return NextResponse.json({ success: true, scheduledSend: data })
    })
  )
}
