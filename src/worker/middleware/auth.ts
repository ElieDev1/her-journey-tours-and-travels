import type { MiddlewareHandler } from "hono";
import { roleCan, type Permission } from "../../shared/constants";
import type { AppEnv } from "../env";
import { HttpError } from "../lib/http";
import { resolveSession } from "../services/auth";

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await resolveSession(c, c.get("db"));
  if (!session) throw new HttpError(401, "Please sign in to continue");
  c.set("admin", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    sessionId: session.session.id,
  });
  await next();
};

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!roleCan(c.get("admin").role, permission)) {
      throw new HttpError(403, "You do not have permission to do that");
    }
    await next();
  };
}
