// FILE: app/api/gmail/thread/[threadId]/route.ts
// PURPOSE: GET route to fetch all messages in a thread and produce an AI thread summary briefing.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { fetchRecentEmails } from "@/lib/gmail-service"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import type { GmailEmail } from "@/lib/gmail-service"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.thread.get", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      
      const { threadId } = await params
      if (!threadId || threadId.length > 100) {
        throw createApiError("VALIDATION_ERROR", "Invalid thread ID", 400)
      }

      addSpanAttributes({ "user.id": userId, "gmail.thread_id": threadId })

      const supabase = getSupabaseAdmin()
      
      // 1. Fetch imported emails from DB first
      const { data: dbEmails } = await supabase
        .from("gmail_imported_emails")
        .select("*")
        .eq("clerk_user_id", userId)
        .eq("gmail_thread_id", threadId)
        .order("imported_at", { ascending: true })

      // Map DB schema to GmailEmail structure
      const mappedDbEmails: GmailEmail[] = (dbEmails || []).map(e => ({
        id: e.gmail_message_id,
        thread_id: e.gmail_thread_id,
        subject: e.subject,
        sender_email: e.sender_email,
        sender_name: e.sender_name,
        snippet: e.snippet,
        body_plain: "",
        body_preview: e.snippet,
        timestamp: e.imported_at,
        is_unread: false,
        labels: [],
        word_count: 0
      }))

      // 2. Fetch recent emails to check for new ones in thread
      let recentEmailsList: GmailEmail[] = []
      try {
        const recent = await fetchRecentEmails(userId, { maxResults: 40 })
        if (recent && recent.emails) {
          recentEmailsList = recent.emails.filter(e => e.thread_id === threadId)
        }
      } catch {
        // Non-fatal if gateway is offline/rate limited; fall back to DB only
      }

      // Merge by message ID
      const emailMap = new Map<string, GmailEmail>()
      mappedDbEmails.forEach(e => emailMap.set(e.id, e))
      recentEmailsList.forEach(e => emailMap.set(e.id, e))

      const threadMessages = Array.from(emailMap.values())
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      if (threadMessages.length === 0) {
        return NextResponse.json({ messages: [], brief: "No messages found in this thread." })
      }

      // 3. AI Briefing generation
      let brief = "This thread contains discussion regarding: " + threadMessages[0].subject
      const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
      if (apiKey && threadMessages.length > 0) {
        try {
          const compiledHistory = threadMessages
            .map(m => `From: ${m.sender_name} <${m.sender_email}>\nDate: ${m.timestamp}\nContent: ${m.snippet}`)
            .join("\n\n")

          const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
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
                  content: "You are an elite productivity coach. Summarize this email thread in exactly 2 short sentences. Focus on the latest status, key request, and who needs to act next. Be extremely concise."
                },
                { role: "user", content: compiledHistory }
              ],
              max_tokens: 120,
              temperature: 0.3
            })
          })

          if (aiRes.ok) {
            const data = await aiRes.json()
            const summary = data.choices?.[0]?.message?.content
            if (summary) {
              brief = summary.trim()
            }
          }
        } catch {
          // Fallback on LLM failure
        }
      }

      return NextResponse.json({
        messages: threadMessages,
        brief
      })
    })
  )
}
