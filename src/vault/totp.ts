/**
 * Wirebox TypeScript SDK - TOTP (RFC 6238)
 *
 * Time-based one-time passwords for `login` secrets that carry a TOTP config.
 * Codes are generated client-side from the decrypted TOTP secret — the Wirebox
 * API never sees the TOTP secret in plaintext.
 *
 * Uses WebCrypto HMAC so it runs in Node 18+, browsers, and Workers.
 */

export const TOTPAlgorithm = {
  SHA1: "sha1",
  SHA256: "sha256",
  SHA512: "sha512",
} as const;
export type TOTPAlgorithm = (typeof TOTPAlgorithm)[keyof typeof TOTPAlgorithm];

export interface TOTPConfig {
  /** Base32-encoded shared secret (RFC 4648, no padding required). */
  secret: string;
  /** Hash algorithm. Defaults to sha1. */
  algorithm?: TOTPAlgorithm;
  /** Number of digits in the code: 6 or 8. Defaults to 6. */
  digits?: number;
  /** Time step in seconds: 30 or 60. Defaults to 30. */
  period?: number;
}

export interface TOTPCode {
  /** The current one-time code, zero-padded to `digits`. */
  code: string;
  /** Whole seconds remaining before the code rolls over. */
  expiresInSeconds: number;
  /** Length of the code. */
  digits: number;
  /** The time step used, in seconds. */
  period: number;
}

const SUBTLE_HASH: Record<TOTPAlgorithm, string> = {
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha512: "SHA-512",
};

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error("WebCrypto (globalThis.crypto.subtle) is unavailable; cannot generate TOTP codes.");
  }
  return c.subtle;
}

/** Normalize a byte array to WebCrypto's `BufferSource` (ArrayBuffer-backed at runtime). */
function bs(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

/** Decode a base32 (RFC 4648) string into bytes. Case-insensitive; ignores spaces and padding. */
function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  if (!/^[A-Z2-7]*$/.test(clean)) {
    throw new Error("Invalid base32 TOTP secret.");
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function validateConfig(config: TOTPConfig): Required<TOTPConfig> {
  const algorithm = config.algorithm ?? TOTPAlgorithm.SHA1;
  const digits = config.digits ?? 6;
  const period = config.period ?? 30;
  if (!config.secret) throw new Error("TOTP config requires a 'secret'.");
  if (!(algorithm in SUBTLE_HASH)) throw new Error(`Unsupported TOTP algorithm: ${algorithm}.`);
  if (digits !== 6 && digits !== 8) throw new Error("TOTP 'digits' must be 6 or 8.");
  if (period !== 30 && period !== 60) throw new Error("TOTP 'period' must be 30 or 60.");
  return { secret: config.secret, algorithm, digits, period };
}

async function hmac(algorithm: TOTPAlgorithm, keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    "raw",
    bs(keyBytes),
    { name: "HMAC", hash: { name: SUBTLE_HASH[algorithm] } },
    false,
    ["sign"]
  );
  return new Uint8Array(await subtle.sign("HMAC", key, bs(message)));
}

/** Compute a TOTP code for a config at a given time (defaults to now). */
export async function generateTotp(config: TOTPConfig, atMs: number = Date.now()): Promise<TOTPCode> {
  const { secret, algorithm, digits, period } = validateConfig(config);
  const counter = Math.floor(atMs / 1000 / period);

  // 8-byte big-endian counter
  const message = new Uint8Array(8);
  let remaining = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  const digest = await hmac(algorithm, base32Decode(secret), message);
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  const code = (binary % 10 ** digits).toString().padStart(digits, "0");
  const elapsed = Math.floor(atMs / 1000) % period;
  return { code, expiresInSeconds: period - elapsed, digits, period };
}

/**
 * Parse a standard `otpauth://totp/...` provisioning URI into a TOTPConfig.
 * Accepts the `secret`, `algorithm`, `digits`, and `period` query parameters.
 */
export function parseTotpUri(uri: string): TOTPConfig {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("Invalid otpauth URI.");
  }
  if (parsed.protocol !== "otpauth:" || parsed.host !== "totp") {
    throw new Error("Not an otpauth://totp/ URI.");
  }
  const secret = parsed.searchParams.get("secret");
  if (!secret) throw new Error("otpauth URI is missing the 'secret' parameter.");

  const config: TOTPConfig = { secret };
  const algorithm = parsed.searchParams.get("algorithm");
  if (algorithm) {
    const lowered = algorithm.toLowerCase();
    if (!(lowered in SUBTLE_HASH)) throw new Error(`Unsupported TOTP algorithm: ${algorithm}.`);
    config.algorithm = lowered as TOTPAlgorithm;
  }
  const digits = parsed.searchParams.get("digits");
  if (digits) config.digits = parseInt(digits, 10);
  const period = parsed.searchParams.get("period");
  if (period) config.period = parseInt(period, 10);

  return validateConfig(config);
}
