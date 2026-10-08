/**
 * Wirebox TypeScript SDK - Vault Client
 *
 * Two-layer surface:
 *   - `VaultClient`:   admin/metadata operations that do not need the vault key
 *                      (info, initialize, list secrets, grant/revoke access).
 *   - `UnlockedVault`: returned by `unlock()`, holds the decrypted Organization
 *                      Encryption Key in memory and does payload crypto
 *                      (read typed secrets, create/update secrets, TOTP codes).
 *
 * The server filters ciphertext by the caller's identity, so an agent key's
 * `unlock()` returns only the secrets granted to it — no client-side filtering.
 */

import type { HttpTransport } from "../http.js";
import { InvalidVaultKeyError, VaultNotInitializedError, VaultSecretNotFoundError, VaultSecretTypeError } from "../errors.js";
import {
  computeAuthHash,
  createVaultInitMaterial,
  decryptPayload,
  deriveMasterKey,
  encryptPayload,
  fromBase64,
  generateVaultKey,
  randomBytes,
  unwrapOrgKey,
  type KdfParams,
} from "./crypto.js";
import { generateTotp, type TOTPCode } from "./totp.js";
import {
  VaultSecretType,
  type ApiKeyPayload,
  type DecryptedSecret,
  type LoginPayload,
  type OtherPayload,
  type SecretPayload,
  type VaultAccessGrant,
  type VaultInfo,
  type VaultSecretSummary,
} from "./types.js";

const BASE = "/v1/vault";

/** The one-time result of initializing a vault. */
export interface VaultInitializeResult {
  /** The vault key. Store it securely — it cannot be recovered. */
  vaultKey: string;
  info: VaultInfo;
  warning: string;
}

interface RawUnlockResponse {
  wrapped_org_key: string;
  kdf_params: KdfParams;
  secrets: Array<VaultSecretSummary & { encrypted_payload: string }>;
}

function generateSecretId(): string {
  const bytes = randomBytes(16);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return `vsec_${hex}`;
}

export class VaultClient {
  constructor(private readonly _http: HttpTransport) {}

  /** Vault metadata for the caller's organization (never returns ciphertext). */
  async info(): Promise<VaultInfo> {
    return this._http.get<VaultInfo>(BASE);
  }

  /**
   * Initialize the organization vault. All cryptographic material is produced
   * client-side; the server only ever stores ciphertext and the auth hash.
   *
   * @param vaultKey - Optional. When omitted, a strong key is generated and
   *   returned. The vault has no recovery codes, so the returned key must be
   *   stored securely — losing it means re-initializing the vault.
   */
  async initialize(vaultKey?: string, kdfParams?: KdfParams): Promise<VaultInitializeResult> {
    const key = vaultKey ?? generateVaultKey();
    const { material } = await createVaultInitMaterial(key, kdfParams);
    const info = await this._http.post<VaultInfo>(`${BASE}/initialize`, {
      kdf_salt: material.kdfSalt,
      kdf_params: material.kdfParams,
      wrapped_org_key: material.wrappedOrgKey,
      auth_hash: material.authHash,
    });
    return {
      vaultKey: key,
      info,
      warning:
        "Store this vault key securely. It cannot be recovered; losing it requires re-initializing the vault.",
    };
  }

  /**
   * Unlock the vault with a vault key and return a crypto-enabled handle.
   * Derives the master key from the server-stored salt + params, verifies via
   * the auth hash, and decrypts every secret the caller is allowed to read.
   */
  async unlock(vaultKey: string): Promise<UnlockedVault> {
    const info = await this.info();
    if (!info.initialized || !info.kdf_salt) {
      throw new VaultNotInitializedError(404, "vault_not_initialized", "No vault exists for this organization.");
    }

    const masterKey = await deriveMasterKey(vaultKey, fromBase64(info.kdf_salt), info.kdf_params);
    const authHash = await computeAuthHash(masterKey);

    const data = await this._http.get<RawUnlockResponse>(`${BASE}/unlock`, { auth_hash: authHash });

    let orgKey: Uint8Array;
    try {
      orgKey = await unwrapOrgKey(masterKey, data.wrapped_org_key);
    } catch {
      throw new InvalidVaultKeyError(401, "invalid_vault_key", "The vault key did not match. Unlock failed.");
    }

    const decrypted: DecryptedSecret[] = [];
    for (const raw of data.secrets ?? []) {
      const payload = await decryptPayload<SecretPayload>(orgKey, raw.encrypted_payload, raw.id);
      decrypted.push({
        id: raw.id,
        type: raw.type,
        name: raw.name,
        description: raw.description,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        payload,
      });
    }
    return new UnlockedVault(this._http, orgKey, decrypted);
  }

  /** List secret metadata (no ciphertext). Scoped keys see only their grants. */
  async listSecrets(options?: { type?: VaultSecretType }): Promise<VaultSecretSummary[]> {
    const res = await this._http.get<{ secrets: VaultSecretSummary[] }>(BASE + "/secrets", {
      type: options?.type,
    });
    return res.secrets ?? [];
  }

  /** List the identities granted access to a secret. Admin only. */
  async listAccess(secretId: string): Promise<VaultAccessGrant[]> {
    const res = await this._http.get<{ access: VaultAccessGrant[] }>(
      `${BASE}/secrets/${encodeURIComponent(secretId)}/access`
    );
    return res.access ?? [];
  }

  /** Grant an agent identity access to a secret. Admin only. */
  async grantAccess(secretId: string, identityId: string): Promise<VaultAccessGrant> {
    return this._http.post<VaultAccessGrant>(
      `${BASE}/secrets/${encodeURIComponent(secretId)}/access`,
      { identity_id: identityId }
    );
  }

  /** Revoke an identity's access to a secret. Admin only. */
  async revokeAccess(secretId: string, identityId: string): Promise<void> {
    await this._http.delete<void>(
      `${BASE}/secrets/${encodeURIComponent(secretId)}/access/${encodeURIComponent(identityId)}`
    );
  }

  /** Permanently delete a secret (and its access grants). Admin only. */
  async deleteSecret(secretId: string): Promise<void> {
    await this._http.delete<void>(`${BASE}/secrets/${encodeURIComponent(secretId)}`);
  }
}

/**
 * A vault unlocked with a valid vault key. Holds the OEK in memory and performs
 * client-side encryption/decryption of secret payloads.
 */
export class UnlockedVault {
  private readonly _byId: Map<string, DecryptedSecret>;

  constructor(
    private readonly _http: HttpTransport,
    private readonly _orgKey: Uint8Array,
    secrets: DecryptedSecret[]
  ) {
    this._byId = new Map(secrets.map((s) => [s.id, s]));
  }

  /** All secrets decrypted at unlock (for an agent key, only its grants). */
  get secrets(): DecryptedSecret[] {
    return [...this._byId.values()];
  }

  /** Get a decrypted secret by id from the unlocked set. */
  getSecret(secretId: string): DecryptedSecret {
    const secret = this._byId.get(secretId);
    if (!secret) {
      throw new VaultSecretNotFoundError(`No secret with id '${secretId}' in the unlocked vault.`);
    }
    return secret;
  }

  private getTyped<T extends SecretPayload>(secretId: string, type: VaultSecretType): T {
    const secret = this.getSecret(secretId);
    if (secret.type !== type) {
      throw new VaultSecretTypeError(`Secret '${secretId}' is of type '${secret.type}', not '${type}'.`);
    }
    return secret.payload as T;
  }

  /** Get the login payload for a `login` secret. */
  getLogin(secretId: string): LoginPayload {
    return this.getTyped<LoginPayload>(secretId, VaultSecretType.LOGIN);
  }

  /** Get the payload for an `api_key` secret. */
  getApiKey(secretId: string): ApiKeyPayload {
    return this.getTyped<ApiKeyPayload>(secretId, VaultSecretType.API_KEY);
  }

  /** Get the payload for an `other` secret. */
  getOther(secretId: string): OtherPayload {
    return this.getTyped<OtherPayload>(secretId, VaultSecretType.OTHER);
  }

  /** Current TOTP code for a `login` secret that has TOTP configured. */
  async getTotpCode(secretId: string): Promise<TOTPCode> {
    const login = this.getLogin(secretId);
    if (!login.totp) {
      throw new VaultSecretTypeError(`Secret '${secretId}' has no TOTP configured.`);
    }
    return generateTotp(login.totp);
  }

  /** Create a new secret: encrypts the payload client-side, then stores it. Admin only. */
  async createSecret(options: {
    type: VaultSecretType;
    name: string;
    description?: string;
    payload: SecretPayload;
  }): Promise<DecryptedSecret> {
    const id = generateSecretId();
    const encrypted = await encryptPayload(this._orgKey, options.payload, id);
    const summary = await this._http.post<VaultSecretSummary>(BASE + "/secrets", {
      id,
      type: options.type,
      name: options.name,
      description: options.description,
      encrypted_payload: encrypted,
    });
    const secret: DecryptedSecret = { ...summary, payload: options.payload };
    this._byId.set(secret.id, secret);
    return secret;
  }

  /** Update a secret's metadata and/or payload. Re-encrypts when a payload is given. Admin only. */
  async updateSecret(
    secretId: string,
    changes: { name?: string; description?: string | null; payload?: SecretPayload }
  ): Promise<DecryptedSecret> {
    const body: Record<string, unknown> = {};
    if (changes.name !== undefined) body.name = changes.name;
    if (changes.description !== undefined) body.description = changes.description;
    if (changes.payload !== undefined) {
      body.encrypted_payload = await encryptPayload(this._orgKey, changes.payload, secretId);
    }

    const summary = await this._http.patch<VaultSecretSummary>(
      `${BASE}/secrets/${encodeURIComponent(secretId)}`,
      body
    );

    const existing = this._byId.get(secretId);
    const payload = changes.payload ?? existing?.payload ?? ({ data: "" } as SecretPayload);
    const secret: DecryptedSecret = { ...summary, payload };
    this._byId.set(secret.id, secret);
    return secret;
  }
}
