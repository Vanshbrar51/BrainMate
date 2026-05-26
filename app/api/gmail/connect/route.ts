// app/api/gmail/connect/route.ts
// Initiates the Google OAuth flow for Gmail via the Rust Gateway proxy.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { generateAuthUrl } from "@/lib/gmail-service";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.connect.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      try {
        const authUrl = await generateAuthUrl(userId);
        return NextResponse.json({ url: authUrl });
      } catch (err) {
        if (err instanceof Error && err.message === "Auth gateway offline") {
          throw createApiError("GATEWAY_OFFLINE", "Authentication gateway is offline", 503);
        }
        throw err;
      }
    });
  });
}
