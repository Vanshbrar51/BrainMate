// lib/gmail-service.ts
// Server-only Gmail service abstraction layer.
// All Gmail API calls go through this module.
// NEVER import this in client components.

import { google } from "googleapis";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  id: string;           // Gmail message ID
  thread_id: string;
  subject: string;
  sender_email: string;
  sender_name: string;
  snippet: string;
  body_plain: string;   // Plain text body (stripped of HTML)
  body_preview: string; // First 500 chars of body_plain
  timestamp: string;    // ISO8601
  is_unread: boolean;
  labels: string[];
  word_count: number;
}

export interface GmailListResponse {
  emails: GmailEmail[];
  next_page_token: string | null;
  total_estimate: number;
}

// ---------------------------------------------------------------------------
// Token Encryption/Decryption
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "[gmail-service] GMAIL_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
      "Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // GCM standard IV length
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv(12 bytes) + authTag(16 bytes) + ciphertext — all hex-encoded
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

export function decryptToken(hexEncrypted: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(hexEncrypted, "hex");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// OAuth Client Factory
// ---------------------------------------------------------------------------

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "[gmail-service] Missing Google OAuth credentials. " +
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ---------------------------------------------------------------------------
// Authorization URL Generation
// ---------------------------------------------------------------------------

export function generateAuthUrl(state: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state,
    prompt: "consent", // Force consent screen so refresh_token is always returned
    include_granted_scopes: true,
  });
}

// ---------------------------------------------------------------------------
// Authorization Code Exchange
// ---------------------------------------------------------------------------

export interface TokenExchangeResult {
  access_token: string;
  refresh_token: string;
  expiry_date: number; // Unix ms
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export async function exchangeAuthCode(code: string): Promise<TokenExchangeResult> {
  const oauth2Client = createOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("[gmail-service] OAuth token exchange returned no access_token");
  }
  if (!tokens.refresh_token) {
    throw new Error(
      "[gmail-service] OAuth token exchange returned no refresh_token. " +
      "The user may need to revoke access and reconnect."
    );
  }

  // Get the user's Gmail address and profile
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  if (!userInfo.email) {
    throw new Error("[gmail-service] Could not retrieve Gmail email from userinfo");
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? (Date.now() + 3600 * 1000),
    email: userInfo.email,
    display_name: userInfo.name ?? userInfo.email,
    avatar_url: userInfo.picture ?? null,
  };
}

// ---------------------------------------------------------------------------
// Authenticated Gmail Client — with automatic token refresh
// ---------------------------------------------------------------------------

async function getAuthenticatedGmailClient(clerkUserId: string) {
  const supabase = getSupabaseAdmin();

  const { data: connection, error } = await supabase
    .from("gmail_connections")
    .select("access_token, refresh_token, token_expiry")
    .eq("clerk_user_id", clerkUserId)
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !connection) {
    throw new Error("[gmail-service] No active Gmail connection found for user");
  }

  const oauth2Client = createOAuth2Client();

  const accessToken = decryptToken(connection.access_token);
  const refreshToken = decryptToken(connection.refresh_token);
  const expiryDate = new Date(connection.token_expiry).getTime();

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
  });

  // Proactively refresh if token expires within 5 minutes
  if (Date.now() >= expiryDate - 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error("[gmail-service] Token refresh failed — no access_token returned");
    }

    // Persist the new token
    const newExpiry = new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000);
    await supabase
      .from("gmail_connections")
      .update({
        access_token: encryptToken(credentials.access_token),
        token_expiry: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_user_id", clerkUserId)
      .eq("is_active", true);

    oauth2Client.setCredentials(credentials);
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// Email Parsing Utilities
// ---------------------------------------------------------------------------

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

interface GmailMessagePart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

function extractPlainText(parts: GmailMessagePart[] | undefined): string {
  if (!parts) return "";

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const nested = extractPlainText(part.parts);
      if (nested) return nested;
    }
  }
  return "";
}

function extractHtmlText(parts: GmailMessagePart[] | undefined): string {
  if (!parts) return "";

  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      const html = decodeBase64Url(part.body.data);
      // Strip HTML tags for plain text version
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    if (part.parts) {
      const nested = extractHtmlText(part.parts);
      if (nested) return nested;
    }
  }
  return "";
}

export function parseEmailHeaders(headers: Array<{ name: string; value: string }>): {
  subject: string;
  from_email: string;
  from_name: string;
  date: string;
} {
  const get = (name: string): string =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const from = get("From");
  const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) ?? from.match(/^(.+)$/);
  const from_name = fromMatch?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  const from_email = fromMatch?.[2]?.trim() ?? from.trim();

  return {
    subject: get("Subject") || "(no subject)",
    from_email,
    from_name: from_name || from_email,
    date: get("Date"),
  };
}

export interface GmailRawMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
  internalDate: string;
}

export function parseGmailMessage(message: GmailRawMessage): GmailEmail {
  const { subject, from_email, from_name, date } = parseEmailHeaders(
    message.payload.headers
  );

  let body_plain = "";

  if (message.payload.mimeType === "text/plain" && message.payload.body?.data) {
    body_plain = decodeBase64Url(message.payload.body.data);
  } else if (message.payload.parts) {
    body_plain = extractPlainText(message.payload.parts);
    if (!body_plain) {
      body_plain = extractHtmlText(message.payload.parts);
    }
  }

  body_plain = body_plain.trim();
  const words = body_plain.split(/\s+/).filter(Boolean);

  return {
    id: message.id,
    thread_id: message.threadId,
    subject,
    sender_email: from_email,
    sender_name: from_name,
    snippet: message.snippet ?? "",
    body_plain,
    body_preview: body_plain.slice(0, 500),
    timestamp: date || new Date(parseInt(message.internalDate)).toISOString(),
    is_unread: message.labelIds?.includes("UNREAD") ?? false,
    labels: message.labelIds ?? [],
    word_count: words.length,
  };
}

// ---------------------------------------------------------------------------
// Public API: Fetch Recent Emails
// ---------------------------------------------------------------------------

export async function fetchRecentEmails(
  clerkUserId: string,
  options: {
    maxResults?: number;
    unreadOnly?: boolean;
    pageToken?: string;
    labelId?: string; // "INBOX", "SENT", "DRAFT" etc.
  } = {}
): Promise<GmailListResponse> {
  const gmail = await getAuthenticatedGmailClient(clerkUserId);

  const {
    maxResults = 20,
    unreadOnly = false,
    pageToken,
    labelId = "INBOX",
  } = options;

  // Build query string
  let q = "";
  if (unreadOnly) q += "is:unread ";
  q = q.trim();

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    pageToken,
    labelIds: [labelId],
    ...(q ? { q } : {}),
  });

  const messages = listResponse.data.messages ?? [];
  const nextPageToken = listResponse.data.nextPageToken ?? null;

  // Fetch full message details in parallel (batch of up to 20)
  const fullMessages = await Promise.all(
    messages.map((msg) =>
      gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      }).then((r) => r.data)
    )
  );

  const emails: GmailEmail[] = fullMessages
    .filter((m): m is NonNullable<typeof m> => m !== null && m !== undefined)
    .map((m) => parseGmailMessage(m as unknown as GmailRawMessage));

  return {
    emails,
    next_page_token: nextPageToken,
    total_estimate: listResponse.data.resultSizeEstimate ?? emails.length,
  };
}

// ---------------------------------------------------------------------------
// Public API: Fetch Single Email by ID
// ---------------------------------------------------------------------------

export async function fetchEmailById(
  clerkUserId: string,
  messageId: string
): Promise<GmailEmail> {
  const gmail = await getAuthenticatedGmailClient(clerkUserId);

  const { data } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return parseGmailMessage(data as unknown as GmailRawMessage);
}

// ---------------------------------------------------------------------------
// Public API: Get Connection Status
// ---------------------------------------------------------------------------

export async function getGmailConnection(
  clerkUserId: string
): Promise<GmailConnection | null> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("gmail_connections")
    .select("id, clerk_user_id, gmail_email, token_expiry, is_active, connected_at, last_synced_at")
    .eq("clerk_user_id", clerkUserId)
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as GmailConnection | null) ?? null;
}
