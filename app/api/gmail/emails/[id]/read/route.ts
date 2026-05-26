// FILE: app/api/gmail/emails/[id]/read/route.ts
// PURPOSE: POST route to mark an email as read in local logs.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.emails.read.post", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      
      const { id } = await params
      if (!id || id.length > 100) {
        throw createApiError("VALIDATION_ERROR", "Invalid message ID", 400)
      }

      addSpanAttributes({ "user.id": userId, "gmail.message_id": id })

      // Simulates marking as read
      return NextResponse.json({ success: true })
    })
  )
}
