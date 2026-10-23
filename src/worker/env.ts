import type { AdminRole } from "../shared/constants";
import type { Database } from "./db/client";

/** Secrets set with `wrangler secret put`; all optional. */
export interface Secrets {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ADMIN_NOTIFY_EMAIL?: string;
  /** One-time code that unlocks /admin/setup while no administrator exists. */
  ADMIN_SETUP_TOKEN?: string;
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
