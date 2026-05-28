// lib/supabase.ts — Server-side Supabase client (service role)
//
// Uses the service role key to bypass RLS. All user-scoping is done
// explicitly in queries (WHERE user_id = $userId).
//
// NEVER import this in client components — server-side only.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createApiError } from "@/lib/writeright-errors";
import { logError, logEvent } from "@/lib/writeright-logger";

// ---------------------------------------------------------------------------
// Singleton — one client per process lifetime
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw createApiError(
      "MISSING_SECRET",
      "[supabase] NEXT_PUBLIC_SUPABASE_URL is not configured. Set it in your environment.",
      500
    );
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw createApiError(
      "MISSING_SECRET",
      "[supabase] SUPABASE_SERVICE_ROLE_KEY is not configured. Set it in your environment.",
      500
    );
  }
  return key;
}

/**
 * Returns a server-side Supabase client using the service role key.
 * This client bypasses RLS — all user-scoping MUST be done in queries.
 *
 * Thread-safety: Node.js is single-threaded — singleton is safe.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  return _client;
}

export function getSupabaseWithTiming(): {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  logSlow: (operationName: string, startMs: number) => void;
} {
  const supabase = getSupabaseAdmin();
  const logSlow = (operationName: string, startMs: number) => {
    const duration = Date.now() - startMs;
    if (duration > 500) {
      logEvent("slow_db_query", {
        operation: operationName,
        duration_ms: duration,
      });
    }
  };
  return { supabase, logSlow };
}
