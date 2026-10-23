import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/** An error whose message is safe to show to API clients. */
export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);

function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function parseWith<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "Please correct the highlighted fields", fieldErrors(result.error));
  }
  return result.data;
}

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  return parseWith(schema, body);
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const query = Object.fromEntries(
    Object.entries(c.req.query()).filter(([, value]) => value !== ""),
  );
  return parseWith(schema, query);
}

export function parseId(value: string | undefined, what = "Resource"): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound(what);
  return id;
}

export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** True if a (possibly Drizzle-wrapped) database error is a UNIQUE violation. */
export function isUniqueViolation(err: unknown, column?: string): boolean {
  for (let e: unknown = err; e; e = e instanceof Error ? e.cause : undefined) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE constraint failed") && (!column || msg.includes(column))) return true;
  }
  return false;
}
