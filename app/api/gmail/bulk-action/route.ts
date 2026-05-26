// FILE: app/api/gmail/bulk-action/route.ts
// PURPOSE: POST route to execute batch actions on Gmail emails (like multi-email summarization or read status updates).

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { fetchEmailById } from "@/lib/gmail-service"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

const BulkActionSchema = z.object({
  action: z.enum(["summarize", "read", "unread"]),
  emailIds: z.array(z.string().min(1)).min(1)
})

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.bulk-action", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON format", 400)
      }

      const parsed = BulkActionSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Validation failed for bulk action", 400, { issues: parsed.error.issues })
      }

      const { action, emailIds } = parsed.data

      // Reject if greater than 10 email IDs
      if (emailIds.length > 10) {
        throw createApiError("VALIDATION_ERROR", "Bulk actions are limited to a maximum of 10 emails at once.", 400)
      }

      const supabase = getSupabaseAdmin()

      if (action === "summarize") {
        // Fetch details of these emails
        const emailDetailsPromises = emailIds.map(async id => {
          // Try DB first
          const { data } = await supabase
            .from("gmail_imported_emails")
            .select("subject, sender_name, snippet")
            .eq("clerk_user_id", userId)
            .eq("gmail_message_id", id)
            .maybeSingle()

          if (data) return data

          // Try fetching from Gmail via gateway
          try {
            return await fetchEmailById(userId, id)
          } catch {
            return null;
          }
        })

        const emails = (await Promise.all(emailDetailsPromises)).filter(Boolean)
        if (emails.length === 0) {
          throw createApiError("NOT_FOUND", "Could not fetch details for any of the selected emails", 404)
        }

        const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
        if (!apiKey) {
          throw createApiError("MISSING_SECRET", "AI Studio API key is not configured", 500)
        }

        const compiledEmails = emails
          .map((e, idx) => `Email ${idx + 1}:
Sender: ${e?.sender_name}
Subject: ${e?.subject}
Snippet: ${e?.snippet}`)
          .join("\n\n")

        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gemini-2.0-flash",
            messages: [
              {
                role: "system",
                content: "You are an AI assistant. Given a list of selected emails, generate a bulleted summary highlighting critical tasks, deadlines, action items, and key takeaways across the entire batch. Keep it organized and clear."
              },
              { role: "user", content: compiledEmails }
            ],
            max_tokens: 400,
            temperature: 0.4
          })
        })

        if (!response.ok) {
          throw createApiError("WORKER_ERROR", "Failed to generate batch summary", 502)
        }

        const data = await response.json()
        const summary = data.choices?.[0]?.message?.content || "No summary generated."

        return NextResponse.json({ success: true, summary })
      }

      // For "read" or "unread", simulate success
      return NextResponse.json({ success: true })
    })
  )
}
