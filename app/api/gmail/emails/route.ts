// app/api/gmail/emails/route.ts
// Fetches recent Gmail emails for the authenticated user.
// Query params: maxResults, unreadOnly, pageToken, label

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchRecentEmails } from "@/lib/gmail-service";
import { withSpan, addSpanAttributes, addSpanEvent } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

const ListEmailsQuerySchema = z.object({
  maxResults: z.coerce.number().int().min(1).max(50).optional().default(20),
  unreadOnly: z.enum(["true", "false"]).optional().default("false"),
  pageToken: z.string().optional(),
  label: z.enum(["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"]).optional().default("INBOX"),
});

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.gmail.emails.list", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      const { searchParams } = new URL(req.url);
      const parsed = ListEmailsQuerySchema.safeParse({
        maxResults: searchParams.get("maxResults"),
        unreadOnly: searchParams.get("unreadOnly"),
        pageToken: searchParams.get("pageToken") ?? undefined,
        label: searchParams.get("label") ?? undefined,
      });

      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid query params", 400, {
          issues: parsed.error.issues,
        });
      }

      const { maxResults, unreadOnly, pageToken, label } = parsed.data;

      let result;
      try {
        result = await fetchRecentEmails(userId, {
          maxResults,
          unreadOnly: unreadOnly === "true",
          pageToken,
          labelId: label,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes("No active Gmail connection")) {
          throw createApiError("GMAIL_NOT_CONNECTED", "Gmail not connected", 404);
        }
        if (msg.includes("Invalid Credentials") || msg.includes("401")) {
          throw createApiError("GMAIL_TOKEN_EXPIRED", "Gmail token expired. Please reconnect.", 401);
        }

        throw createApiError("GMAIL_FETCH_FAILED", "Failed to fetch emails", 500);
      }

      addSpanEvent("gmail.emails.fetched", { count: result.emails.length });

      return NextResponse.json(result);
    });
  });
}
