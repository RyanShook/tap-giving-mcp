// Organization API keys (spec sections 2.1, 3.1.1, 3.3, 3.5).
//
// Format: tg_live_<orgslug>_<secret> / tg_test_<orgslug>_<secret>,
// secret = 32 bytes of randomness, base64url. Only the SHA-256 hash of
// the full key is stored, in MCP_KEYS under KEYHASH:<sha256 hex>.
// Lookup happens per call, never cached beyond the request, so a
// revocation (one status write) is effective on the next call.

import { ToolError } from "./errors.ts";

export interface KeyRecord {
  orgSlug: string;
  orgName: string;
  contactEmail: string;
  mode: "live" | "test";
  scopes: string[];
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt?: string;
  issuedTo: string;
  issuedBy: string;
  issuedAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

export interface AuthedKey {
  record: KeyRecord;
  keyHash: string;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const KEY_RE = /^tg_(live|test)_([a-z0-9][a-z0-9-]{0,80})_([A-Za-z0-9_-]{20,})$/;

export function parseKeyFormat(key: string): { mode: "live" | "test"; orgSlug: string } | null {
  const m = KEY_RE.exec(key.trim());
  if (!m) return null;
  return { mode: m[1] as "live" | "test", orgSlug: m[2] };
}

/**
 * Resolve the Authorization header to an active key record.
 * Returns null when no header is present (the keyless surface).
 * Throws unauthorized for a malformed, unknown, or revoked key.
 */
export async function authenticate(
  kv: KVNamespace,
  request: Request,
): Promise<AuthedKey | null> {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) throw new ToolError("unauthorized", "Authorization must be: Bearer <organization API key>.");
  const key = m[1].trim();
  const parsed = parseKeyFormat(key);
  if (!parsed) {
    throw new ToolError("unauthorized", "That API key is malformed. Keys look like tg_live_<orgslug>_<secret>.");
  }
  const keyHash = await sha256Hex(key);
  const raw = await kv.get(`KEYHASH:${keyHash}`);
  if (!raw) throw new ToolError("unauthorized", "That API key is not recognized.");
  let record: KeyRecord;
  try {
    record = JSON.parse(raw) as KeyRecord;
  } catch {
    throw new ToolError("unauthorized", "That API key is not recognized.");
  }
  if (record.orgSlug !== parsed.orgSlug || record.mode !== parsed.mode) {
    throw new ToolError("unauthorized", "That API key is not recognized.");
  }
  if (record.status !== "active") {
    throw new ToolError("unauthorized", "That API key has been revoked. Ask Tap.Giving for a new key.");
  }
  return { record, keyHash };
}

/** A tool that requires a key: absent or bad key is unauthorized. */
export function requireKey(auth: AuthedKey | null): AuthedKey {
  if (!auth) {
    throw new ToolError(
      "unauthorized",
      "This tool needs your organization API key in the Authorization header (Bearer tg_live_... or tg_test_...). " +
        "Discovery, pricing, product, and the artwork spec need no key. To get a key, email the Tap.Giving team at " +
        "hello@tap.giving, say which organization the key is for, and the team replies within one business day.",
    );
  }
  return auth;
}

/** Best-effort lastUsedAt stamp on write calls; never fails the call. */
export async function touchKey(kv: KVNamespace, auth: AuthedKey): Promise<void> {
  try {
    const updated: KeyRecord = { ...auth.record, lastUsedAt: new Date().toISOString() };
    await kv.put(`KEYHASH:${auth.keyHash}`, JSON.stringify(updated));
  } catch {
    /* bookkeeping only */
  }
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
