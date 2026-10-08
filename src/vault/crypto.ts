/**
 * Wirebox TypeScript SDK - Vault Client-Side Cryptography
 *
 * Zero-knowledge credential vault crypto. All encryption and decryption happens
 * here, in the client; the Wirebox API only ever stores and returns ciphertext.
 *
 *   vault key --Argon2id(salt)--> master key
 *   master key --AES-256-GCM--> wraps the Organization Encryption Key (OEK)
 *   OEK --AES-256-GCM--> encrypts each secret's JSON payload
 *
 * Primitives:
 *   - KDF:        Argon2id (hash-wasm), parameters carried per-vault by the server
 *   - Encryption: AES-256-GCM (WebCrypto `crypto.subtle`, works in Node 18+,
 *                 browsers, and Cloudflare Workers)
 *   - Auth hash:  SHA-256(master key), an unlock verifier the server compares
 *
 * Ciphertext blob layout (then base64-encoded):
 *   [version:1][algorithm:1][iv:12][ciphertext||gcmTag]
 * The leading version/algorithm bytes let the encryption scheme evolve without
 * breaking existing ciphertext — a reader dispatches on them.
 */

import { argon2id } from "hash-wasm";

/** Default Argon2id parameters used when initializing a new vault. */
export const DEFAULT_KDF_PARAMS = {
  algorithm: "argon2id" as const,
  m: 65536, // memory in KiB (64 MiB)
  t: 3, // iterations
  p: 1, // parallelism
};

export interface KdfParams {
  algorithm?: string;
  m?: number;
  t?: number;
  p?: number;
}

const MASTER_KEY_BYTES = 32;
const OEK_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;

const BLOB_VERSION = 1;
const ALG_AES_256_GCM = 1;

// ---------------------------------------------------------------------------
// Cross-runtime helpers
// ---------------------------------------------------------------------------

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error(
      "WebCrypto (globalThis.crypto.subtle) is unavailable. Node 18+, a browser, or a Workers runtime is required."
    );
  }
  return c;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  getCrypto().getRandomValues(out);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Normalize a byte array to WebCrypto's `BufferSource`. Our arrays are always
 * ArrayBuffer-backed at runtime; this satisfies the stricter lib typings that
 * distinguish `ArrayBuffer` from `SharedArrayBuffer`.
 */
function bs(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

// ---------------------------------------------------------------------------
// Blob packing (versioned, self-describing)
// ---------------------------------------------------------------------------

function packBlob(iv: Uint8Array, ciphertext: Uint8Array): string {
  const blob = new Uint8Array(2 + iv.length + ciphertext.length);
  blob[0] = BLOB_VERSION;
  blob[1] = ALG_AES_256_GCM;
  blob.set(iv, 2);
  blob.set(ciphertext, 2 + iv.length);
  return toBase64(blob);
}

function unpackBlob(value: string): { iv: Uint8Array; ciphertext: Uint8Array } {
  const blob = fromBase64(value);
  if (blob.length < 2 + IV_BYTES + 16) {
    throw new Error("Malformed vault ciphertext: blob is too short.");
  }
  const version = blob[0];
  const algorithm = blob[1];
  if (version !== BLOB_VERSION) {
    throw new Error(`Unsupported vault ciphertext version: ${version}.`);
  }
  if (algorithm !== ALG_AES_256_GCM) {
    throw new Error(`Unsupported vault ciphertext algorithm: ${algorithm}.`);
  }
  return {
    iv: blob.slice(2, 2 + IV_BYTES),
    ciphertext: blob.slice(2 + IV_BYTES),
  };
}

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return getCrypto().subtle.importKey("raw", bs(keyBytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function gcmParams(iv: Uint8Array, aad?: string): AesGcmParams {
  const params: AesGcmParams = { name: "AES-GCM", iv: bs(iv) };
  if (aad) params.additionalData = bs(utf8(aad));
  return params;
}

async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  aad?: string
): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const key = await importAesKey(keyBytes);
  const ciphertext = new Uint8Array(await getCrypto().subtle.encrypt(gcmParams(iv, aad), key, bs(plaintext)));
  return packBlob(iv, ciphertext);
}

async function aesGcmDecrypt(keyBytes: Uint8Array, blobB64: string, aad?: string): Promise<Uint8Array> {
  const { iv, ciphertext } = unpackBlob(blobB64);
  const key = await importAesKey(keyBytes);
  return new Uint8Array(await getCrypto().subtle.decrypt(gcmParams(iv, aad), key, bs(ciphertext)));
}

// ---------------------------------------------------------------------------
// Key derivation & material
// ---------------------------------------------------------------------------

/**
 * Generate a fresh, high-entropy vault key for the user to store.
 *
 * The vault has no recovery codes, so entropy matters: this produces ~160 bits
 * from a Crockford-ish base32 alphabet, grouped for legibility
 * (e.g. `WBV-ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456`).
 */
export function generateVaultKey(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(20);
  let body = "";
  for (let i = 0; i < bytes.length; i++) body += alphabet[bytes[i]! % alphabet.length];
  const groups = body.match(/.{1,4}/g) ?? [];
  return `WBV-${groups.join("-")}`;
}

/** Generate a random salt for a brand-new vault. */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/** Generate a random 256-bit Organization Encryption Key. */
export function generateOrgKey(): Uint8Array {
  return randomBytes(OEK_BYTES);
}

/** Derive the 32-byte master key from a vault key and salt via Argon2id. */
export async function deriveMasterKey(
  vaultKey: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<Uint8Array> {
  const result = await argon2id({
    password: vaultKey,
    salt,
    iterations: params.t ?? DEFAULT_KDF_PARAMS.t,
    memorySize: params.m ?? DEFAULT_KDF_PARAMS.m,
    parallelism: params.p ?? DEFAULT_KDF_PARAMS.p,
    hashLength: MASTER_KEY_BYTES,
    outputType: "binary",
  });
  return new Uint8Array(result);
}

/** Compute the unlock verifier: SHA-256(master key) as a hex digest. */
export async function computeAuthHash(masterKey: Uint8Array): Promise<string> {
  const digest = await getCrypto().subtle.digest("SHA-256", bs(masterKey));
  return toHex(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// OEK wrapping / payload encryption
// ---------------------------------------------------------------------------

/** Wrap (encrypt) the OEK under the master key. No AAD: the vault has one key. */
export async function wrapOrgKey(masterKey: Uint8Array, orgKey: Uint8Array): Promise<string> {
  return aesGcmEncrypt(masterKey, orgKey);
}

/** Unwrap (decrypt) the OEK using the master key. Throws on a wrong vault key. */
export async function unwrapOrgKey(masterKey: Uint8Array, wrappedB64: string): Promise<Uint8Array> {
  return aesGcmDecrypt(masterKey, wrappedB64);
}

/** Encrypt a secret payload object with the OEK, binding it to its secret id. */
export async function encryptPayload(
  orgKey: Uint8Array,
  payload: unknown,
  secretId: string
): Promise<string> {
  const plaintext = utf8(JSON.stringify(payload));
  return aesGcmEncrypt(orgKey, plaintext, secretId);
}

/** Decrypt a secret payload blob with the OEK and parse its JSON. */
export async function decryptPayload<T = unknown>(
  orgKey: Uint8Array,
  blobB64: string,
  secretId: string
): Promise<T> {
  const plaintext = await aesGcmDecrypt(orgKey, blobB64, secretId);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/**
 * Material produced client-side at vault initialization and sent to the server.
 * The server stores exactly this and never sees the vault key or the OEK.
 */
export interface VaultInitMaterial {
  kdfSalt: string; // base64
  kdfParams: KdfParams;
  wrappedOrgKey: string; // base64 blob
  authHash: string; // hex
}

/**
 * Produce all server-bound material for a new vault from a vault key: a random
 * salt and OEK, the wrapped OEK, and the auth hash.
 */
export async function createVaultInitMaterial(
  vaultKey: string,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<{ material: VaultInitMaterial; orgKey: Uint8Array }> {
  const salt = generateSalt();
  const orgKey = generateOrgKey();
  const masterKey = await deriveMasterKey(vaultKey, salt, params);
  const wrappedOrgKey = await wrapOrgKey(masterKey, orgKey);
  const authHash = await computeAuthHash(masterKey);
  return {
    material: {
      kdfSalt: toBase64(salt),
      kdfParams: params,
      wrappedOrgKey,
      authHash,
    },
    orgKey,
  };
}
