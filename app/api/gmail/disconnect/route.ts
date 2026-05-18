// app/api/gmail/disconnect/route.ts
// Soft-disconnects the Gmail account by setting is_active = false.
// Does NOT revoke Google OAuth tokens (user can revoke in Google account settings).

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes, addSpanEvent } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.disconnect.post", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("gmail_connections")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("clerk_user_id", userId)
        .eq("is_active", true);

      if (error) {
        throw createApiError("DB_ERROR", "Failed to disconnect Gmail", 500);
      }

      // Also deactivate the mail_integrations row
      await supabase
        .from("mail_integrations")
        .update({ is_active: false })
        .eq("clerk_user_id", userId)
        .eq("provider", "gmail");

      addSpanEvent("gmail.disconnected", {});

      return NextResponse.json({ disconnected: true });
    });
  });
}
