// FILE: app/api/writeright/suggestions/accept/route.ts
// POST — Mark a smart suggestion as accepted

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes } from "@/lib/tracing";

const AcceptSuggestionSchema = z.object({
  suggestionId: z.string().uuid(),
});

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.suggestions.accept.post", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const parsed = AcceptSuggestionSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, {
          issues: parsed.error.issues,
        });
      }

      const { suggestionId } = parsed.data;
      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("writeright_smart_suggestions")
        .update({ accepted: true, updated_at: new Date().toISOString() })
        .eq("id", suggestionId)
        .eq("clerk_user_id", userId);

      if (error) {
        throw createApiError("DB_ERROR", "Failed to accept suggestion", 500);
      }

      return NextResponse.json({ accepted: true });
    })
  );
}
