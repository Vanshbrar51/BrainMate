// app/api/gmail/status/route.ts
// Returns the current Gmail connection status for the authenticated user.
// NEVER returns tokens — only safe metadata.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getGmailConnection } from "@/lib/gmail-service";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.status.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      try {
        const connection = await getGmailConnection(userId);

        if (!connection) {
          return NextResponse.json({ connected: false, connection: null });
        }

        // Return ONLY safe metadata — never tokens
        return NextResponse.json({
          connected: true,
          connection: {
            gmail_email: connection.gmail_email,
            connected_at: connection.connected_at,
            last_synced_at: connection.last_synced_at,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === "Auth gateway offline") {
          return NextResponse.json({
            connected: false,
            connection: null,
            error: "Auth gateway offline",
          });
        }
        throw err;
      }
    });
  });
}
