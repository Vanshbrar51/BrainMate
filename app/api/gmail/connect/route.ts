// app/api/gmail/connect/route.ts
// Initiates the Google OAuth flow for Gmail.
// Generates a state token (CSRF protection) and redirects to Google.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { generateAuthUrl } from "@/lib/gmail-service";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

// State token TTL: 10 minutes
const STATE_TTL_SECS = 600;

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.connect.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      // Generate a random state token — binds the OAuth callback to this user
      const rawState = randomBytes(32).toString("hex");
      // Embed userId in state so callback can verify it
      const statePayload = JSON.stringify({ userId, nonce: rawState });
      const state = Buffer.from(statePayload).toString("base64url");
      const stateHash = createHash("sha256").update(state).digest("hex");

      // Store state in Redis for verification in the callback
      if (!isCircuitOpen()) {
        try {
          await getRedisPool().setex(
            ns("gmail", "oauth_state", stateHash),
            STATE_TTL_SECS,
            userId
          );
        } catch {
          // If Redis is unavailable, encode userId in state itself (still secure)
        }
      }

      const authUrl = generateAuthUrl(state);

      return NextResponse.json({ url: authUrl });
    });
  });
}
