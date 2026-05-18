// app/api/gmail/callback/route.ts
// Handles the Google OAuth callback.
// Exchanges auth code for tokens, stores encrypted tokens in Supabase.
// Redirects to /dashboard/writing after success.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  exchangeAuthCode,
  encryptToken,
  type TokenExchangeResult,
} from "@/lib/gmail-service";
import { withSpan, addSpanAttributes, addSpanEvent } from "@/lib/tracing";
import { withErrorHandler } from "@/lib/writeright-errors";

const CALLBACK_ORIGIN = process.env.GOOGLE_REDIRECT_URI?.replace("/api/gmail/callback", "")
  ?? "http://localhost:3000";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.callback.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        // Redirect to sign-in — don't throw (this is a redirect flow)
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

      // Verify state — decode and check userId matches
      let stateUserId: string;
      try {
        const statePayload = JSON.parse(Buffer.from(state, "base64url").toString()) as { userId: string };
        stateUserId = statePayload.userId;
      } catch {
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=invalid_state`
        );
      }

      if (stateUserId !== userId) {
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=state_mismatch`
        );
      }

      // Additional Redis state verification (if available)
      if (!isCircuitOpen()) {
        try {
          const stateHash = createHash("sha256").update(state).digest("hex");
          const storedUserId = await getRedisPool().get(
            ns("gmail", "oauth_state", stateHash)
          );
          if (storedUserId && storedUserId !== userId) {
            return NextResponse.redirect(
              `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=state_mismatch`
            );
          }
          // Consume the state token (one-time use)
          await getRedisPool().del(ns("gmail", "oauth_state", stateHash));
        } catch {
          // Non-fatal — state was verified via payload above
        }
      }

      // Exchange authorization code for tokens
      let tokenResult: TokenExchangeResult;
      try {
        tokenResult = await exchangeAuthCode(code);
      } catch (err) {
        console.error("[gmail.callback] Token exchange failed:", {
          error: err instanceof Error ? err.message : String(err),
          user_id: userId,
        });
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=token_exchange_failed`
        );
      }

      // Store encrypted tokens in Supabase
      const supabase = getSupabaseAdmin();
      const tokenExpiry = new Date(tokenResult.expiry_date).toISOString();

      const { error: upsertError } = await supabase
        .from("gmail_connections")
        .upsert(
          {
            clerk_user_id: userId,
            gmail_email: tokenResult.email,
            access_token: encryptToken(tokenResult.access_token),
            refresh_token: encryptToken(tokenResult.refresh_token),
            token_expiry: tokenExpiry,
            is_active: true,
            connected_at: new Date().toISOString(),
          },
          { onConflict: "clerk_user_id,gmail_email" }
        );

      if (upsertError) {
        console.error("[gmail.callback] Token storage failed:", {
          error: upsertError.message,
          user_id: userId,
        });
        return NextResponse.redirect(
          `${CALLBACK_ORIGIN}/dashboard/writing?gmail_error=storage_failed`
        );
      }

      // Also upsert the extensible mail_integrations row
      await supabase.from("mail_integrations").upsert(
        {
          clerk_user_id: userId,
          provider: "gmail",
          email_address: tokenResult.email,
          display_name: tokenResult.display_name,
          avatar_url: tokenResult.avatar_url,
          is_active: true,
          metadata: { scope: "gmail.readonly" },
        },
        { onConflict: "clerk_user_id,provider,email_address" }
      );

      addSpanEvent("gmail.connected", { email: tokenResult.email });

      // Redirect back to WriteRight with success signal
      return NextResponse.redirect(
        `${CALLBACK_ORIGIN}/dashboard/writing?gmail_connected=true`
      );
    });
  });
}
