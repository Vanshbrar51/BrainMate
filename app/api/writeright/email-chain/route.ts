// FILE: app/api/writeright/email-chain/route.ts
// PURPOSE: POST (SSE) stream to generate the next email draft and advice in a multi-turn chain.

import { auth } from "@clerk/nextjs/server"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

const MessageSchema = z.object({
  id: z.string(),
  label: z.string(),
  body: z.string(),
  isAI: z.boolean()
})

const EmailChainSchema = z.object({
  messages: z.array(MessageSchema),
  nextGoal: z.string().min(5).max(1000)
})

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.email-chain", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON format", 400)
      }

      const parsed = EmailChainSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid email chain data", 400, { issues: parsed.error.issues })
      }

      const { messages, nextGoal } = parsed.data
      const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
      if (!apiKey) {
        throw createApiError("MISSING_SECRET", "AI Studio API key is not configured", 500)
      }

      // Format previous thread for model context
      const threadHistory = messages
        .map(m => `--- ${m.label} ---\n${m.body}`)
        .join("\n\n")

      const systemPrompt = `You are an elite business negotiator and writing assistant. Given a history of an email chain and a target goal for the next email, you will draft the next response AND provide strategic negotiation advice.

You MUST structure your response EXACTLY as follows:
[EMAIL_BODY]
(Write the drafted email response here. Use placeholders like [Name] in brackets where needed. Keep it professional and realistic.)

[STRATEGIC_ADVICE]
Negotiation Status: (Provide a 1-sentence status of the negotiation, e.g. "Drafting the initial pitch" or "Resolving price conflict")
Tone Trend: (Must be exactly one of: escalating | de-escalating | neutral)
Recommended Next Move: (A short actionable suggestion for the user, e.g. "Suggest a 15-minute phone call to align")
Risk Assessment: (A 1-sentence assessment of risks involved in this reply, e.g. "Low risk, but watch for pushback on timelines")`

      const userPrompt = `EMAIL CHAIN HISTORY:
${threadHistory || "No prior messages. This is the first email."}

NEXT EMAIL GOAL:
${nextGoal}

Draft the next email and compile strategic advice.`

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
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1500,
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
          let currentMode: "body" | "advice" | "header" = "header"
          let adviceText = ""

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
                    if (!text) continue

                    // Parse stream mode switches
                    const fullText = (adviceText + text)
                    if (fullText.includes("[EMAIL_BODY]") && currentMode === "header") {
                      currentMode = "body"
                      continue
                    }

                    if (fullText.includes("[STRATEGIC_ADVICE]")) {
                      currentMode = "advice"
                      adviceText += text
                      continue
                    }

                    if (currentMode === "body") {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`))
                    } else if (currentMode === "advice") {
                      adviceText += text
                    }
                  } catch {
                    // Ignore line parse issues
                  }
                }
              }
            }

            // Parse and send the advice payload
            // Parse markers out of adviceText:
            // "Negotiation Status: ...\nTone Trend: ...\nRecommended Next Move: ...\nRisk Assessment: ..."
            const cleanAdvice = adviceText.replace("[STRATEGIC_ADVICE]", "").trim()
            const lines = cleanAdvice.split("\n")
            
            let status = "Under review"
            let toneTrend = "neutral"
            let nextMove = "Continue correspondence"
            let risk = "No critical risks identified"

            lines.forEach(l => {
              const lowerLine = l.toLowerCase()
              if (lowerLine.startsWith("negotiation status:")) {
                status = l.slice("negotiation status:".length).trim()
              } else if (lowerLine.startsWith("tone trend:")) {
                const parsedTrend = l.slice("tone trend:".length).trim().toLowerCase()
                if (parsedTrend.includes("escalating")) toneTrend = "escalating"
                else if (parsedTrend.includes("de-escalating")) toneTrend = "de-escalating"
                else toneTrend = "neutral"
              } else if (lowerLine.startsWith("recommended next move:")) {
                nextMove = l.slice("recommended next move:".length).trim()
              } else if (lowerLine.startsWith("risk assessment:")) {
                risk = l.slice("risk assessment:".length).trim()
              }
            })

            const adviceObject = {
              negotiationStatus: status,
              toneTrend,
              recommendedNextMove: nextMove,
              riskAssessment: risk
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "advice", advice: adviceObject })}\n\n`))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Email chain stream error" })}\n\n`))
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
