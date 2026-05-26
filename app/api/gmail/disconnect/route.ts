// app/api/gmail/disconnect/route.ts
// Soft-disconnects the Gmail account via the Rust Auth Gateway proxy.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { disconnectGmail } from "@/lib/gmail-service";
import { withSpan, addSpanAttributes, addSpanEvent } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.disconnect.post", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      try {
        await disconnectGmail(userId);
      } catch (err) {
        if (err instanceof Error && err.message === "Auth gateway offline") {
          throw createApiError("GATEWAY_OFFLINE", "Authentication gateway is offline", 503);
        }
        throw createApiError("DB_ERROR", "Failed to disconnect Gmail", 500);
      }

      addSpanEvent("gmail.disconnected", {});

      return NextResponse.json({ disconnected: true });
    });
  });
}
