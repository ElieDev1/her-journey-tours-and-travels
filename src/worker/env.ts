import type { AdminRole } from "../shared/constants";
import type { Database } from "./db/client";

/** Secrets set with `wrangler secret put` (or the dashboard); all optional. */
export interface Secrets {
  /** Enables Sign in with Google together with the GOOGLE_CLIENT_ID var. */
  GOOGLE_CLIENT_SECRET?: string;
  /** Fallback email provider, used only if the Cloudflare EMAIL binding fails. */
  RESEND_API_KEY?: string;
  ADMIN_NOTIFY_EMAIL?: string;
  /** One-time code that unlocks /admin/setup while no administrator exists. */
  ADMIN_SETUP_TOKEN?: string;
  /**
   * Development-only overrides so the Google flow can be tested against a
   * local mock. Ignored unless APP_ENV is "development".
   */
  DEV_GOOGLE_AUTH_URL?: string;
  DEV_GOOGLE_TOKEN_URL?: string;
  DEV_GOOGLE_JWKS_URL?: string;
}

export interface AuthedAdmin {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  sessionId: number;
}

export interface AppEnv {
  Bindings: Env & Secrets;
  Variables: {
    db: Database;
    admin: AuthedAdmin;
  };
}
