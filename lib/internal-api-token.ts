import { getSecret } from "@/lib/secrets";

function parseTokenList(raw: string): string[] {
  return raw
    .split(/[\n,\r]/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function uniqueNonEmpty(tokens: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function readTokensFromFile(path: string): Promise<string[]> {
  try {
    if (process.env.NEXT_RUNTIME !== "nodejs") {
      return [];
    }
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    return parseTokenList(raw);
  } catch {
    return [];
  }
}

export async function getInternalApiTokenCandidates(): Promise<string[]> {
  const tokens: string[] = [];

  const secretToken = await getSecret("INTERNAL_API_TOKEN");
  if (secretToken) {
    tokens.push(secretToken);
  }

  const envToken = process.env.INTERNAL_API_TOKEN ?? "";
  const envTokenValue = process.env.INTERNAL_API_TOKEN_VALUE ?? "";
  tokens.push(envToken, envTokenValue);

  const previous = process.env.INTERNAL_API_TOKENS_PREVIOUS ?? "";
  tokens.push(...parseTokenList(previous));

  const tokenFile =
    process.env.INTERNAL_API_TOKENS_FILE ?? ".secrets/internal_api_tokens.txt";
  tokens.push(...(await readTokensFromFile(tokenFile)));

  return uniqueNonEmpty(tokens);
}

export async function getPreferredInternalApiToken(): Promise<string> {
  const candidates = await getInternalApiTokenCandidates();
  return candidates[0] ?? "";
}
