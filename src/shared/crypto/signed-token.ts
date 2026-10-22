import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tamper-proof tokens: a JSON payload plus an HMAC-SHA256 signature, both
 * base64url ("<payload>.<signature>"). Readable by anyone, so never put secrets
 * in the payload; include an expiry (`exp`, ms since epoch) and check it.
 */

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken(payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

/** The payload, or null when the token was changed, signed with another secret or is malformed. */
export function verifyToken(token: string, secret: string): unknown {
  const [data, signature, extra] = token.split(".");
  if (!data || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Signs a plain string (e.g. the parameters of a signed link). */
export function signString(value: string, secret: string): string {
  return sign(value, secret);
}

export function verifyString(value: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(value, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
