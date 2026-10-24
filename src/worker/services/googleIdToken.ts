// Verification of Google OpenID Connect ID tokens with Web Crypto.
// Self-contained (no Worker bindings) so it can be tested in isolation.

export interface GoogleJwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
  use?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

export class IdTokenError extends Error {}

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CLOCK_SKEW_S = 60;

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(segment: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new IdTokenError("Malformed token");
}

/**
 * Verify an ID token's RS256 signature against Google's published keys and
 * check its claims: issuer, audience, expiry, nonce and verified email.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string; nonce: string; getKey: (kid: string) => Promise<GoogleJwk | undefined>; now?: number },
): Promise<GoogleIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new IdTokenError("Malformed token");
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = decodeJson(headerB64);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new IdTokenError("Unsupported token algorithm");

  const jwk = await opts.getKey(header.kid);
  if (!jwk) throw new IdTokenError("Unknown signing key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new IdTokenError("Invalid token signature");

  const claims = decodeJson(payloadB64);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw new IdTokenError("Wrong issuer");
  const aud = claims.aud;
  if (!(aud === opts.clientId || (Array.isArray(aud) && aud.includes(opts.clientId)))) throw new IdTokenError("Wrong audience");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) throw new IdTokenError("Token expired");
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_S > now) throw new IdTokenError("Token issued in the future");
  if (claims.nonce !== opts.nonce) throw new IdTokenError("Nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) throw new IdTokenError("Missing subject");
  if (typeof claims.email !== "string" || !claims.email) throw new IdTokenError("Missing email");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new IdTokenError("Email not verified");

  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null,
  };
}
