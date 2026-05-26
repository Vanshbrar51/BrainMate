// FILE: app/api/gmail/smart-compose/route.ts
// PURPOSE: POST (SSE) stream to generate an AI email reply using Gemini.

import { auth } from "@clerk/nextjs/server"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

const SmartComposeSchema = z.object({
  emailBody: z.string().min(1).max(20000),
  tone: z.string().optional().default("Professional"),
  prompt: z.string().optional(),
  subject: z.string().optional()
})

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.gmail.smart-compose", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON format", 400)
      }

      const parsed = SmartComposeSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input parameters", 400)
      }

      const { emailBody, tone, prompt: userPrompt, subject } = parsed.data
      const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
      if (!apiKey) {
        throw createApiError("MISSING_SECRET", "AI Studio API key is not configured", 500)
      }

      const systemPrompt = `You are an elite email writing assistant. Draft a reply to the incoming email provided by the user.
Use the selected tone: "${tone}".
${userPrompt ? `Follow these specific instructions: "${userPrompt}"` : ""}
Output ONLY the drafted email body text. Do not include subject lines (unless specifically asked), greetings to the user, or conversational filler.`

      const content = `INCOMING EMAIL:${subject ? `\nSubject: ${subject}` : ""}\n\n${emailBody}`

      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content }
          ],
          max_tokens: 1200,
          temperature: 0.6,
          stream: true
        })
      })

      if (!response.ok) {
        throw createApiError("WORKER_ERROR", "Failed to communicate with LLM provider", 502)
      }

      const encoder = new TextEncoder()
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(controller) {
          if (!reader) {
            controller.close()
            return
          }

          let buffer = ""
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split("\n")
              buffer = lines.pop() || ""

              for (const line of lines) {
                const cleanLine = line.trim()
                if (!cleanLine || cleanLine === "data: [DONE]") continue

                if (cleanLine.startsWith("data: ")) {
                  try {
                    const parsedData = JSON.parse(cleanLine.slice(6))
                    const text = parsedData.choices?.[0]?.delta?.content || ""
                    if (text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`))
                    }
                  } catch {
                    // Ignore parsing issues
                  }
                }
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Smart compose stream error" })}\n\n`))
          } finally {
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no"
        }
      })
    })
  )
}
