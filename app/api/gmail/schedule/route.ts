// FILE: app/api/gmail/schedule/route.ts
// PURPOSE: POST route to save a new scheduled email send task to the database.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

const ScheduleSendSchema = z.object({
  gmailEmail: z.string().email(),
  recipientEmail: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  scheduledAt: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date" })
})

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.schedule.create", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400)
      }

      const parsed = ScheduleSendSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Validation failed for scheduled send", 400, { issues: parsed.error.issues })
      }

      const { gmailEmail, recipientEmail, subject, body: emailBody, scheduledAt } = parsed.data
      
      // Ensure scheduled time is in the future
      const scheduledTime = new Date(scheduledAt).getTime()
      if (scheduledTime <= Date.now()) {
        throw createApiError("VALIDATION_ERROR", "Scheduled time must be in the future", 400)
      }

      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from("gmail_scheduled_sends")
        .insert({
          clerk_user_id: userId,
          gmail_email: gmailEmail,
          recipient_email: recipientEmail,
          subject,
          body: emailBody,
          scheduled_at: new Date(scheduledAt).toISOString(),
          status: "pending"
        })
        .select("*")
        .single()

      if (error || !data) {
        throw createApiError("DB_ERROR", "Failed to schedule email", 500)
      }

      return NextResponse.json({ success: true, scheduledSend: data })
    })
  )
}
