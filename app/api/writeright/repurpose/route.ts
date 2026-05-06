import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { withSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000"
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || "dev-token"

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.repurpose.post", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)

      const body = await req.json()
      const { prompt, target_platform } = body
      if (!prompt) throw createApiError("VALIDATION_ERROR", "Missing prompt", 400)

      addSpanAttributes({ "user.id": userId, "module": "repurpose" })

      const traceHeaders = injectTraceContext(new Headers())

      const pythonRes = await fetch(`${PYTHON_WORKER_URL}/content-flow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Token": INTERNAL_API_TOKEN,
          ...traceHeaders,
        },
        body: JSON.stringify({ prompt, userId, target_platform, traceparent: traceHeaders.traceparent }),
      })

      if (!pythonRes.ok) {
        throw createApiError("WORKER_ERROR", "Worker failed to process request", 502)
      }

      const data = await pythonRes.json()
      return NextResponse.json(data)
    })
  })
}
