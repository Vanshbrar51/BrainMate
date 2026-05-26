// FILE: app/api/writeright/templates/generate/route.ts
// PURPOSE: POST (SSE) stream to generate a customized template using Gemini AI.

import { auth } from "@clerk/nextjs/server"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

const GenerateTemplateSchema = z.object({
  prompt: z.string().min(5).max(1000)
})

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.templates.generate", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON format", 400)
      }

      const parsed = GenerateTemplateSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Prompt is too short or invalid", 400)
      }

      const userPrompt = parsed.data.prompt
      const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
      if (!apiKey) {
        throw createApiError("MISSING_SECRET", "AI Studio API key is not configured", 500)
      }

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
              content: "You are a professional writing assistant. Generate a reusable text template based on the user's request. Use placeholders in brackets like [Client Name] or [Project Date] for variables. Output ONLY the template body text. No greetings, introductions, or conversational filler."
            },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1000,
          temperature: 0.7,
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
                    // Ignore line parsing issues
                  }
                }
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Stream error occurred" })}\n\n`))
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
