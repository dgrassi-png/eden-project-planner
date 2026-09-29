/**
 * Compact HMAC-SHA256 signed tokens for planner cookies (session and SSO
 * pending state). Web Crypto only, so it works in the proxy and in route
 * handlers. Format: base64url(JSON payload) + "." + base64url(signature).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface TokenClaims {
  /** Token purpose, so a pending-SSO token can never be used as a session. */
  typ: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

export async function signToken<T extends TokenClaims>(claims: T, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Verified, unexpired claims of the expected type, or null. Signature check is constant-time. */
export async function verifyToken<T extends TokenClaims>(
  token: string | undefined,
  secret: string,
  expectedType: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<T | null> {
  if (!token || token.length > 4096) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const signatureBytes = fromBase64Url(signature);
  const payloadBytes = fromBase64Url(payload);
  if (!signatureBytes || !payloadBytes) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signatureBytes, encoder.encode(payload));
  if (!valid) return null;
  try {
    const claims = JSON.parse(decoder.decode(payloadBytes)) as Partial<T>;
    if (claims.typ !== expectedType || typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
    return claims as T;
  } catch {
    return null;
  }
}
