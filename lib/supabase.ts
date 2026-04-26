// lib/supabase.ts — Server-side Supabase client (service role)
//
// Uses the service role key to bypass RLS. All user-scoping is done
// explicitly in queries (WHERE user_id = $userId).
//
// NEVER import this in client components — server-side only.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Singleton — one client per process lifetime
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL is not configured. Set it in your environment.",
    );
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY is not configured. Set it in your environment.",
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
