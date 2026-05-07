// app/api/writeright/voice/[id]/route.ts — Delete specific Brand Voice example

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing";

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || "dev-token";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.voice.delete", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const { id } = await params;
      if (!id) throw createApiError("VALIDATION_ERROR", "Missing example ID", 400);

      addSpanAttributes({ "user.id": userId, "writeright.voice.id": id });

      const traceHeaders = injectTraceContext(new Headers());
      const res = await fetch(`${PYTHON_WORKER_URL}/voice/examples/${id}?user_id=${userId}`, {
        method: "DELETE",
        headers: {
          "X-Internal-API-Token": INTERNAL_API_TOKEN,
          ...traceHeaders,
        },
      });

      if (!res.ok) throw createApiError("WORKER_ERROR", "Failed to delete style example", 502);

      return NextResponse.json({ status: "success" });
    });
  });
}
