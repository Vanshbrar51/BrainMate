// lib/secrets.ts — Cloud KMS / Secret Manager integration
//
// Replaces env-based secrets (INTERNAL_API_TOKEN, OTP_PEPPER) with
// cloud-managed secrets from AWS Secrets Manager or GCP Secret Manager.
// Falls back to env vars for local development.
//
// Usage:
//   const token = await getSecret("INTERNAL_API_TOKEN");
//   const pepper = await getSecret("OTP_PEPPER");

import { withClientSpan, addSpanAttributes } from "@/lib/tracing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SecretProvider = "env" | "aws_sm" | "gcp_sm";

interface CachedSecret {
  value: string;
  fetchedAt: number;
  versionId?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROVIDER: SecretProvider =
  (process.env.SECRET_PROVIDER as SecretProvider) || "env";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute cache TTL
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const GCP_PROJECT = process.env.GCP_PROJECT_ID || "";

// Secret name mapping: env var name → cloud secret name
const SECRET_MAPPING: Record<string, string> = {
  INTERNAL_API_TOKEN: process.env.SM_INTERNAL_API_TOKEN_NAME || "brainmate/auth/internal-api-token",
  OTP_PEPPER: process.env.SM_OTP_PEPPER_NAME || "brainmate/auth/otp-pepper",
  CLERK_SECRET_KEY: process.env.SM_CLERK_SECRET_NAME || "brainmate/auth/clerk-secret-key",
  REDIS_URL: process.env.SM_REDIS_URL_NAME || "brainmate/auth/redis-url",
};

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const secretCache = new Map<string, CachedSecret>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve a secret by name. Uses cache to avoid excessive cloud API calls.
 * Falls back to env vars if cloud provider is not configured or fails.
 */
export async function getSecret(name: string): Promise<string> {
  return getSecretWithOptions(name, { forceRefresh: false });
}

export async function getSecretWithOptions(
  name: string,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  // Check cache first
  const cached = secretCache.get(name);
  if (
    !options.forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return cached.value;
  }

  return withClientSpan("secrets.get", async () => {
    addSpanAttributes({
      "secret.name": name,
      "secret.provider": PROVIDER,
    });

    let value: string | null = null;

    switch (PROVIDER) {
      case "aws_sm":
        value = await fetchFromAWSSecretsManager(name);
        break;
      case "gcp_sm":
        value = await fetchFromGCPSecretManager(name);
        break;
      case "env":
      default:
        value = process.env[name] ?? null;
        break;
    }

    // Fallback to env var if cloud fetch fails
    if (!value) {
      value = process.env[name] ?? "";
      if (PROVIDER !== "env") {
        console.warn(
          `[secrets] Cloud fetch failed for ${name}, using env var fallback`,
        );
      }
    }

    // Update cache
    secretCache.set(name, {
      value,
      fetchedAt: Date.now(),
    });

    return value;
  }, {
    "rpc.system": "secrets",
    "rpc.method": "getSecret",
  });
}

/**
 * Invalidate a cached secret (e.g., after rotation detection).
 */
export function invalidateSecret(name: string): void {
  secretCache.delete(name);
}

/**
 * Invalidate all cached secrets.
 */
export function invalidateAllSecrets(): void {
  secretCache.clear();
}

/**
 * Check if secrets need rotation (version changed in cloud provider).
 * Returns list of secret names that have newer versions available.
 */
export async function checkRotation(): Promise<string[]> {
  if (PROVIDER === "env") return [];

  const rotated: string[] = [];

  for (const [envName] of Object.entries(SECRET_MAPPING)) {
    const cached = secretCache.get(envName);
    if (!cached) continue;

    try {
      const current = await getSecretWithOptions(envName, { forceRefresh: true });
      if (current !== cached.value) {
        rotated.push(envName);
        console.log(`[secrets] Rotation detected for ${envName}`);
      }
    } catch {
      // Skip rotation check on error
    }
  }

  return rotated;
}

// ---------------------------------------------------------------------------
// AWS Secrets Manager
// ---------------------------------------------------------------------------

async function fetchFromAWSSecretsManager(name: string): Promise<string | null> {
  const secretName = SECRET_MAPPING[name] || name;

  try {
    // Use runtime-only dynamic import to keep cloud SDKs optional.
    const awsSdk = await optionalImport("@aws-sdk/client-secrets-manager");
    if (!awsSdk) return null;
    const { SecretsManagerClient, GetSecretValueCommand } = awsSdk as {
      SecretsManagerClient: new (args: { region: string }) => {
        send: (command: unknown) => Promise<{
          SecretString?: string;
          SecretBinary?: Uint8Array;
        }>;
      };
      GetSecretValueCommand: new (args: { SecretId: string }) => unknown;
    };

    const client = new SecretsManagerClient({ region: AWS_REGION });
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (response.SecretString) {
      // Try to parse as JSON (multi-value secret)
      try {
        const parsed = JSON.parse(response.SecretString);
        // If it's a JSON object, return the value matching the env var name
        if (typeof parsed === "object" && name in parsed) {
          return parsed[name];
        }
      } catch {
        // Not JSON — return raw string
      }
      return response.SecretString;
    }

    if (response.SecretBinary) {
      return Buffer.from(response.SecretBinary).toString("utf-8");
    }

    return null;
  } catch (err) {
    console.error(`[secrets] AWS Secrets Manager error for ${secretName}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// GCP Secret Manager
// ---------------------------------------------------------------------------

async function fetchFromGCPSecretManager(name: string): Promise<string | null> {
  const secretName = SECRET_MAPPING[name] || name;

  try {
    const gcpSdk = await optionalImport("@google-cloud/secret-manager");
    if (!gcpSdk) return null;
    const { SecretManagerServiceClient } = gcpSdk as {
      SecretManagerServiceClient: new () => {
        accessSecretVersion: (args: { name: string }) => Promise<Array<{
          payload?: { data?: Uint8Array | string };
        }>>;
      };
    };

    const client = new SecretManagerServiceClient();
    const fullName = `projects/${GCP_PROJECT}/secrets/${secretName}/versions/latest`;

    const [response] = await client.accessSecretVersion({ name: fullName });
    const payload = response.payload?.data;

    if (payload) {
      return typeof payload === "string"
        ? payload
        : new TextDecoder().decode(payload as Uint8Array);
    }

    return null;
  } catch (err) {
    console.error(`[secrets] GCP Secret Manager error for ${secretName}:`, err);
    return null;
  }
}

async function optionalImport(moduleName: string): Promise<unknown | null> {
  try {
    const dynamicImport = new Function(
      "m",
      "return import(m)",
    ) as (m: string) => Promise<unknown>;
    return await dynamicImport(moduleName);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Background rotation checker (starts in instrumentation.ts)
// ---------------------------------------------------------------------------

let rotationInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic rotation checking (every 30 seconds).
 */
export function startRotationChecker(): void {
  if (PROVIDER === "env" || rotationInterval) return;

  rotationInterval = setInterval(async () => {
    try {
      const rotated = await checkRotation();
      if (rotated.length > 0) {
        console.log(`[secrets] Rotated secrets detected: ${rotated.join(", ")}`);
        // Invalidate rotated secrets so next access fetches fresh values
        for (const name of rotated) {
          invalidateSecret(name);
        }
      }
    } catch (err) {
      console.error("[secrets] Rotation check error:", err);
    }
  }, 30_000);

  console.log("[secrets] Rotation checker started");
}

/**
 * Stop the rotation checker.
 */
export function stopRotationChecker(): void {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
  }
}
