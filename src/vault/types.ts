/**
 * Wirebox TypeScript SDK - Vault Types
 *
 * Secret payload shapes. Payloads are JSON-encoded, encrypted client-side, and
 * stored as opaque ciphertext; the server only sees type + name + ciphertext.
 * Field names are the canonical on-the-wire keys shared across all Wirebox
 * SDKs, so an encrypted payload written by one SDK decodes in another.
 */

import type { TOTPConfig } from "./totp.js";

export const VaultSecretType = {
  LOGIN: "login",
  API_KEY: "api_key",
  OTHER: "other",
} as const;
export type VaultSecretType = (typeof VaultSecretType)[keyof typeof VaultSecretType];

/** Account login credentials, with optional TOTP two-factor. */
export interface LoginPayload {
  username?: string;
  email?: string;
  password?: string;
  /** The service these credentials log into. */
  service_url?: string;
  totp?: TOTPConfig;
}

/** An API key or token. */
export interface ApiKeyPayload {
  key: string;
  /** The service the key authenticates against. */
  service_url?: string;
}

/** Freeform secret for anything that does not fit the structured types. */
export interface OtherPayload {
  data: string;
}

export type SecretPayload = LoginPayload | ApiKeyPayload | OtherPayload;

/** Server-stored metadata for a vault secret (no ciphertext). */
export interface VaultSecretSummary {
  id: string;
  type: VaultSecretType;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** A vault secret decrypted client-side: metadata plus its typed payload. */
export interface DecryptedSecret<T extends SecretPayload = SecretPayload> extends VaultSecretSummary {
  payload: T;
}

/** Vault metadata needed to derive the master key client-side. */
export interface VaultInfo {
  initialized: boolean;
  id?: string;
  kdf_salt?: string;
  kdf_params?: { algorithm?: string; m?: number; t?: number; p?: number };
  created_at?: string;
  updated_at?: string;
}

/** An access grant linking a secret to an agent identity. */
export interface VaultAccessGrant {
  id: string;
  secret_id: string;
  identity_id: string;
  created_at: string;
}
