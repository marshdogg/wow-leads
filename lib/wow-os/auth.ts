import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token auth for machine callers, in the shape `app/api/cron/triggers`
 * already uses. Same rule, same failure mode, one implementation.
 *
 * **Fails closed.** With the secret unset the request is rejected rather than
 * allowed — in development too. A missing environment variable must never be
 * the thing standing between the open internet and a write endpoint, and the
 * "it works locally without config" convenience is exactly how that ships.
 */
export function isAuthorisedBearer(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  return safeEqual(header.slice(prefix.length), secret);
}

/** Constant-time compare that does not leak length through an early return. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare against a same-length buffer and discard the result.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
