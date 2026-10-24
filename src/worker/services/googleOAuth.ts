import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { randomToken, safeEqual } from "../lib/crypto";
import { IdTokenError, verifyGoogleIdToken, type GoogleIdentity, type GoogleJwk } from "./googleIdToken";

type Bindings = AppEnv["Bindings"];
export type OAuthIntent = "customer" | "admin";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const FLOW_TTL_S = 10 * 60;

export function googleEnabled(env: Bindings): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Local mock endpoints are honoured only in development. */
function endpoints(env: Bindings) {
  const dev = env.APP_ENV === "development";
  return {
    auth: (dev && env.DEV_GOOGLE_AUTH_URL) || AUTH_URL,
    token: (dev && env.DEV_GOOGLE_TOKEN_URL) || TOKEN_URL,
    jwks: (dev && env.DEV_GOOGLE_JWKS_URL) || JWKS_URL,
  };
}

/** The redirect URI registered with Google for whichever host served this request. */
export function redirectUri(c: Context<AppEnv>): string {
  return `${new URL(c.req.url).origin}/api/auth/google/callback`;
}

/** Only same-site paths are allowed as post-login destinations. */
export function safeReturnTo(value: string | undefined, intent: OAuthIntent): string {
  const fallback = intent === "admin" ? "/admin" : "/account";
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/api/")) return fallback;
  if (intent === "admin" ? !value.startsWith("/admin") : value.startsWith("/admin")) return fallback;
  return value;
}

// ---------- flow state (short-lived httpOnly cookie) ----------

interface FlowState {
  state: string;
  verifier: string;
  nonce: string;
  intent: OAuthIntent;
  returnTo: string;
}

function flowCookieName(env: Bindings): string {
  return env.APP_ENV === "development" ? "hj_oauth" : "__Host-hj_oauth";
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Begin the authorization-code flow with state, nonce and PKCE (S256). Returns Google's URL. */
export async function startGoogleFlow(c: Context<AppEnv>, intent: OAuthIntent, returnTo: string): Promise<string> {
  const flow: FlowState = { state: randomToken(24), verifier: randomToken(48), nonce: randomToken(24), intent, returnTo };
  setCookie(c, flowCookieName(c.env), btoa(JSON.stringify(flow)), {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    // Lax so the cookie comes back on Google's top-level redirect to the callback.
    sameSite: "Lax",
    path: "/",
    maxAge: FLOW_TTL_S,
  });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(c),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await pkceChallenge(flow.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${endpoints(c.env).auth}?${params}`;
}

export class OAuthFlowError extends Error {
  constructor(
    public readonly code: "google_cancelled" | "google_expired" | "google_failed",
    public readonly intent: OAuthIntent,
  ) {
    super(code);
  }
}

/** Read and clear the flow cookie, then check the returned state. */
export function consumeFlow(c: Context<AppEnv>): FlowState {
  const raw = getCookie(c, flowCookieName(c.env));
  deleteCookie(c, flowCookieName(c.env), { path: "/", secure: c.env.APP_ENV !== "development" });
  let flow: FlowState | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(atob(raw)) : null;
    if (parsed && typeof parsed === "object") flow = parsed as FlowState;
  } catch {
    flow = null;
  }
  const intent: OAuthIntent = flow?.intent === "admin" ? "admin" : "customer";
  if (!flow || typeof flow.state !== "string" || typeof flow.verifier !== "string" || typeof flow.nonce !== "string") {
    throw new OAuthFlowError("google_expired", intent);
  }
  if (c.req.query("error")) throw new OAuthFlowError("google_cancelled", intent);
  const state = c.req.query("state") ?? "";
  if (!safeEqual(state, flow.state)) throw new OAuthFlowError("google_failed", intent);
  return { ...flow, intent, returnTo: safeReturnTo(flow.returnTo, intent) };
}

// ---------- code exchange & ID token verification ----------

let jwksCache: { keys: GoogleJwk[]; expiresAt: number } | null = null;

async function loadKeys(env: Bindings, force = false): Promise<GoogleJwk[]> {
  if (!force && jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const res = await fetch(endpoints(env).jwks);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: GoogleJwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  jwksCache = { keys: body.keys ?? [], expiresAt: Date.now() + Math.min(maxAge, 86_400) * 1000 };
  return jwksCache.keys;
}

/** Exchange the authorization code and return the verified Google identity. */
export async function completeGoogleFlow(c: Context<AppEnv>, flow: FlowState): Promise<GoogleIdentity> {
  const code = c.req.query("code");
  if (!code) throw new OAuthFlowError("google_failed", flow.intent);
  try {
    const res = await fetch(endpoints(c.env).token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(c),
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
    });
    const body = (await res.json()) as { id_token?: string; error?: string };
    if (!res.ok || !body.id_token) throw new Error(`token exchange failed: ${res.status} ${body.error ?? ""}`);
    return await verifyGoogleIdToken(body.id_token, {
      clientId: c.env.GOOGLE_CLIENT_ID,
      nonce: flow.nonce,
      getKey: async (kid) => {
        let key = (await loadKeys(c.env)).find((k) => k.kid === kid);
        // Google rotates keys; refetch once on an unknown key id.
        if (!key) key = (await loadKeys(c.env, true)).find((k) => k.kid === kid);
        return key;
      },
    });
  } catch (err) {
    console.error("google_oauth_failed", { error: String(err), idTokenError: err instanceof IdTokenError });
    throw new OAuthFlowError("google_failed", flow.intent);
  }
}
