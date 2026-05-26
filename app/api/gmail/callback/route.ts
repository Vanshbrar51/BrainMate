// app/api/gmail/callback/route.ts
// Handles the Google OAuth callback by delegating to the Rust Auth Gateway proxy.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { handleCallback } from "@/lib/gmail-service";
import { withSpan, addSpanAttributes, addSpanEvent } from "@/lib/tracing";
import { withErrorHandler } from "@/lib/writeright-errors";

const CALLBACK_ORIGIN = process.env.GOOGLE_REDIRECT_URI?.replace("/api/gmail/callback", "")
  ?? "http://localhost:3000";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.callback.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.redirect(`${CALLBACK_ORIGIN}/sign-in`);
      }

      addSpanAttributes({ "user.id": userId });

      const { searchParams } = new URL(req.url);
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const oauthError = searchParams.get("error");

      // User denied access
      if (oauthError) {
        addSpanEvent("gmail.oauth.denied", { error: oauthError });
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=access_denied`
        );
      }

      if (!code || !state) {
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=invalid_callback`
        );
      }

      try {
        await handleCallback(code, state, userId);
      } catch (err) {
        console.error("[gmail.callback] Gateway token exchange failed:", {
          error: err instanceof Error ? err.message : String(err),
          user_id: userId,
        });
        const msg = err instanceof Error ? err.message : String(err);
        const errType = msg === "Auth gateway offline" ? "gateway_offline" : "token_exchange_failed";
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=${errType}`
        );
      }

      addSpanEvent("gmail.connected", {});

      return NextResponse.redirect(
        `${CALLBACK_ORIGIN}/dashboard/writing?gmail_connected=true`
      );
    });
  });
}
