/**
 * Wirebox TypeScript SDK - Webhook Signature Verification
 *
 * Implements standard HMAC-SHA256 verification using Web Standard Web Crypto (crypto.subtle).
 * Fully compatible with Node.js 18+, Bun, Deno, Next.js Edge, and Cloudflare Workers.
 */

import type { VerifyWebhookOptions } from "./types.js";

const DEFAULT_TOLERANCE_MS = 300_000; // 5 minutes

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Resolves a header value case-insensitively from Headers instance or plain Record.
 */
function getHeader(
  headers: Record<string, string | string[] | undefined> | Headers,
  name: string
): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) || undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const lowerName = name.toLowerCase();
  for (const [k, v] of Object.entries(record)) {
    if (k.toLowerCase() === lowerName) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

/**
 * Verifies that an incoming webhook request was authentically dispatched by Wirebox.
 *
 * Supports two calling conventions:
 *
 * @example Passing standard Web Request
 * ```ts
 * const isValid = await verifyWebhook(req, process.env.WIREBOX_WEBHOOK_SECRET!);
 * ```
 *
 * @example Passing payload and headers
 * ```ts
 * const isValid = await verifyWebhook({
 *   payload: rawBody,
 *   headers: req.headers,
 *   secret: process.env.WIREBOX_WEBHOOK_SECRET!
 * });
 * ```
 */
export async function verifyWebhook(
  reqOrOptions: Request | VerifyWebhookOptions,
  secretParam?: string,
  optionsParam?: { toleranceMs?: number }
): Promise<boolean> {
  let rawBody: string;
  let headers: Record<string, string | string[] | undefined> | Headers;
  let secret: string;
  let toleranceMs: number;

  if (typeof (reqOrOptions as Request).clone === "function" || typeof (reqOrOptions as Request).text === "function") {
    // Calling convention A: (req: Request, secret: string, options?: { toleranceMs?: number })
    const req = (reqOrOptions as Request).clone();
    rawBody = await req.text();
    headers = req.headers;
    secret = secretParam || "";
    toleranceMs = optionsParam?.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  } else {
    // Calling convention B: (options: VerifyWebhookOptions)
    const opts = reqOrOptions as VerifyWebhookOptions;
    if (typeof opts.payload === "string") {
      rawBody = opts.payload;
    } else {
      rawBody = new TextDecoder().decode(opts.payload);
    }
    headers = opts.headers;
    secret = opts.secret;
    toleranceMs = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  }

  if (!secret) return false;

  const signatureHeader = getHeader(headers, "x-wirebox-signature") || "";
  const requestId = getHeader(headers, "x-wirebox-request-id") || "";
  const timestampStr = getHeader(headers, "x-wirebox-timestamp") || "";

  if (!signatureHeader.startsWith("sha256=")) return false;
  if (!requestId || !timestampStr) return false;

  // 1. Verify timestamp freshness (replay attack prevention)
  const timestampSec = parseInt(timestampStr, 10);
  if (Number.isNaN(timestampSec)) return false;

  const nowMs = Date.now();
  const eventMs = timestampSec * 1000;
  if (Math.abs(nowMs - eventMs) > toleranceMs) {
    return false;
  }

  // 2. Reconstruct signature string: `${requestId}.${timestamp}.${rawBody}`
  const signedString = `${requestId}.${timestampStr}.${rawBody}`;

  // 3. Compute HMAC-SHA256 using Web Crypto
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(signedString);

    const subtleCrypto = globalThis.crypto?.subtle;
    if (!subtleCrypto) {
      throw new Error("Web Crypto API (crypto.subtle) is not available in this environment.");
    }

    const key = await subtleCrypto.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await subtleCrypto.sign("HMAC", key, msgData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    const receivedHex = signatureHeader.slice("sha256=".length);

    // 4. Constant-time comparison
    return timingSafeEqual(expectedHex, receivedHex);
  } catch {
    return false;
  }
}
