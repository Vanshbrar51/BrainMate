import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import { withSpan, addSpanAttributes, addSpanEvent, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

export async function DELETE(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.account.data.delete", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      const confirm = req.headers.get("X-Confirm-Delete");
      if (confirm !== "DELETE_ALL_MY_WRITERIGHT_DATA") {
        throw createApiError("CONFIRMATION_REQUIRED", "Include header X-Confirm-Delete: DELETE_ALL_MY_WRITERIGHT_DATA to confirm.", 400);
      }

      const supabase = getSupabaseAdmin();

      // Deleting writeright_chats cascades to messages and jobs via FK,
      // but some other tables might need manual deletion depending on their setup.
      // Doing explicit deletes where cascading isn't guaranteed or for root entities.

      // 1. writeright_feedback (references jobs/chats)
      await supabase.from("writeright_feedback").delete().eq("user_id", userId);
      // 2. writeright_shares (references jobs/chats)
      await supabase.from("writeright_shares").delete().eq("user_id", userId);
      // 3. writeright_ai_jobs
      await supabase.from("writeright_ai_jobs").delete().eq("user_id", userId);
      // 4. writeright_messages
      await supabase.from("writeright_messages").delete().eq("user_id", userId);
      // 5. writeright_usage
      await supabase.from("writeright_usage").delete().eq("user_id", userId);
      // 6. writeright_chats (root)
      await supabase.from("writeright_chats").delete().eq("user_id", userId);
      // 7. writeright_templates
      await supabase.from("writeright_templates").delete().eq("user_id", userId);
      // 8. writeright_streaks
      await supabase.from("writeright_streaks").delete().eq("user_id", userId);
      // 9. writeright_achievements
      await supabase.from("writeright_achievements").delete().eq("user_id", userId);
      // 10. writeright_writing_profiles
      await supabase.from("writeright_writing_profiles").delete().eq("user_id", userId);
      // 11. writeright_user_settings
      await supabase.from("writeright_user_settings").delete().eq("user_id", userId);

      // Purge Redis keys
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const keysToDelete = [
            ns("writeright", "ratelimit", userId),
            ns("writeright", "stats", userId),
            ns("writeright", "profile", userId),
            ns("writeright", "quota", userId),
          ];
          await redis.del(...keysToDelete);
        } catch (err) {
          console.error("[api.writeright.account.data] Redis delete failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      addSpanEvent("gdpr.data_deleted", { user_id: userId, timestamp: new Date().toISOString() });

      return new Response(null, { status: 204 });
    });
  });
}
