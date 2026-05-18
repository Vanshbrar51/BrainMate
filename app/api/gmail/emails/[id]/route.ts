// app/api/gmail/emails/[id]/route.ts
// Fetches a single Gmail email by message ID.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchEmailById } from "@/lib/gmail-service";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.emails.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const { id: messageId } = await params;

      if (!messageId || messageId.length > 100) {
        throw createApiError("VALIDATION_ERROR", "Invalid message ID", 400);
      }

      addSpanAttributes({ "user.id": userId, "gmail.message_id": messageId });

      let email;
      try {
        email = await fetchEmailById(userId, messageId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("No active Gmail connection")) {
          throw createApiError("GMAIL_NOT_CONNECTED", "Gmail not connected", 404);
        }
        if (msg.includes("404") || msg.includes("not found")) {
          throw createApiError("NOT_FOUND", "Email not found", 404);
        }
        throw createApiError("GMAIL_FETCH_FAILED", "Failed to fetch email", 500);
      }

      // Log the import audit
      try {
        await getSupabaseAdmin().from("gmail_imported_emails").upsert(
          {
            clerk_user_id: userId,
            gmail_message_id: messageId,
            gmail_thread_id: email.thread_id,
            subject: email.subject,
            sender_email: email.sender_email,
            sender_name: email.sender_name,
            snippet: email.snippet,
            imported_at: new Date().toISOString(),
          },
          { onConflict: "clerk_user_id,gmail_message_id", ignoreDuplicates: true }
        );
      } catch {
        // Non-fatal audit log failure
      }

      return NextResponse.json({ email });
    });
  });
}
