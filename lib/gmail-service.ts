// lib/gmail-service.ts
// Thin proxy to Rust Auth Gateway. Zero credentials. Zero token handling.
import { getPreferredInternalApiToken } from "@/lib/internal-api-token";
import { createApiError } from "@/lib/writeright-errors";
import { logError, logEvent } from "@/lib/writeright-logger";

const GW = process.env.AUTH_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:9091";

export interface GmailConnection {
  id: string;
  clerk_user_id: string;
  gmail_email: string;
  token_expiry: string;
  is_active: boolean;
  connected_at: string;
  last_synced_at: string | null;
}

export interface GmailEmail {
  id: string;
  thread_id: string;
  subject: string;
  sender_email: string;
  sender_name: string;
  snippet: string;
  body_plain: string;
  body_preview: string;
  timestamp: string;
  is_unread: boolean;
  labels: string[];
  word_count: number;
}

export interface GmailListResponse {
  emails: GmailEmail[];
  next_page_token: string | null;
  total_estimate: number;
}

async function gw_post<T>(path: string, body: unknown): Promise<T> {
  const token = await getPreferredInternalApiToken();
  let r;
  try {
    r = await fetch(`${GW}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-token": token,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logError("gw_post_fetch_failed", { error: err instanceof Error ? err.message : String(err) });
    throw createApiError("GATEWAY_OFFLINE", "Auth gateway offline", 503);
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({})) as { message?: string };
    throw createApiError("GATEWAY_ERROR", e.message ?? `Gateway ${r.status}`, r.status);
  }
  return r.json() as Promise<T>;
}

async function gw_get<T>(path: string): Promise<T> {
  const token = await getPreferredInternalApiToken();
  let r;
  try {
    r = await fetch(`${GW}${path}`, {
      headers: {
        "x-internal-api-token": token,
      },
      cache: "no-store",
    });
  } catch (err) {
    logError("gw_get_fetch_failed", { error: err instanceof Error ? err.message : String(err) });
    throw createApiError("GATEWAY_OFFLINE", "Auth gateway offline", 503);
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({})) as { message?: string };
    throw createApiError("GATEWAY_ERROR", e.message ?? `Gateway ${r.status}`, r.status);
  }
  return r.json() as Promise<T>;
}

export const generateAuthUrl = (uid: string): Promise<string> =>
  gw_post<{ url: string }>("/v1/gmail/url", { clerk_user_id: uid }).then(r => r.url);

export const handleCallback = (code: string, state: string, uid: string): Promise<{ connected: boolean; gmail_email: string }> =>
  gw_post("/v1/gmail/callback", { code, state, clerk_user_id: uid });

export const getGmailConnection = (uid: string): Promise<GmailConnection | null> =>
  gw_get<{ connected: boolean; connection: GmailConnection | null }>(`/v1/gmail/status/${uid}`)
    .then(r => r.connection);

export const fetchRecentEmails = (
  uid: string,
  p: {
    maxResults?: number;
    unreadOnly?: boolean;
    pageToken?: string;
    labelId?: string;
  } = {}
): Promise<GmailListResponse> =>
  gw_get<GmailListResponse>(`/v1/gmail/emails/${uid}?${new URLSearchParams({
    max_results: String(p.maxResults ?? 20),
    unread_only: String(p.unreadOnly ?? false),
    label: p.labelId ?? "INBOX",
    ...(p.pageToken ? { page_token: p.pageToken } : {}),
  })}`);

export const fetchEmailById = (uid: string, id: string): Promise<GmailEmail> =>
  gw_get<{ email: GmailEmail }>(`/v1/gmail/emails/${uid}/${id}`).then(r => r.email);

export const disconnectGmail = (uid: string): Promise<{ disconnected: boolean }> =>
  gw_post("/v1/gmail/disconnect", { clerk_user_id: uid });
