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
   * Unlock the vault and return a crypto-enabled handle. Derives the master key
   * from the server-stored salt + params, verifies via the auth hash, and
   * decrypts every secret the caller is allowed to read.
   *
   * @param vaultKey - The vault key. When omitted, falls back to the
   *   `WIREBOX_VAULT_KEY` environment variable (convenient for agent processes).
   */
  async unlock(vaultKey?: string): Promise<UnlockedVault> {
    const key =
      vaultKey ??
      (typeof process !== "undefined" ? process.env?.WIREBOX_VAULT_KEY : undefined);
    if (!key) {
      throw new InvalidVaultKeyError(
        401,
        "missing_vault_key",
        "A vault key is required. Pass it to unlock() or set WIREBOX_VAULT_KEY."
      );
    }

    const info = await this.info();
    if (!info.initialized || !info.kdf_salt) {
      throw new VaultNotInitializedError(404, "vault_not_initialized", "No vault exists for this organization.");
    }

    const masterKey = await deriveMasterKey(key, fromBase64(info.kdf_salt), info.kdf_params);
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

  /** Resolve a secret name to its id (ids starting with `vsec_` pass through). */
  private async resolveSecretId(nameOrId: string): Promise<string> {
    if (nameOrId.startsWith("vsec_")) return nameOrId;
    const secrets = await this.listSecrets();
    const matches = secrets.filter((s) => s.name.toLowerCase() === nameOrId.toLowerCase());
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length > 1) {
      throw new Error(`Multiple secrets are named '${nameOrId}'. Use the secret id (vsec_...).`);
    }
    throw new VaultSecretNotFoundError(`No secret named or identified by '${nameOrId}'.`);
  }

  /** List the identities granted access to a secret (by name or id). Admin only. */
  async listAccess(secret: string): Promise<VaultAccessGrant[]> {
    const id = await this.resolveSecretId(secret);
    const res = await this._http.get<{ access: VaultAccessGrant[] }>(`${BASE}/secrets/${encodeURIComponent(id)}/access`);
    return res.access ?? [];
  }

  /** Grant an agent identity access to a secret (by name or id). Admin only. */
  async grantAccess(secret: string, identityId: string): Promise<VaultAccessGrant> {
    const id = await this.resolveSecretId(secret);
    return this._http.post<VaultAccessGrant>(`${BASE}/secrets/${encodeURIComponent(id)}/access`, {
      identity_id: identityId,
    });
  }

  /** Revoke an identity's access to a secret (by name or id). Admin only. */
  async revokeAccess(secret: string, identityId: string): Promise<void> {
    const id = await this.resolveSecretId(secret);
    await this._http.delete<void>(
      `${BASE}/secrets/${encodeURIComponent(id)}/access/${encodeURIComponent(identityId)}`
    );
  }

  /** Permanently delete a secret (by name or id), and its access grants. Admin only. */
  async deleteSecret(secret: string): Promise<void> {
    const id = await this.resolveSecretId(secret);
    await this._http.delete<void>(`${BASE}/secrets/${encodeURIComponent(id)}`);
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

  /**
   * Get a decrypted secret from the unlocked set by id or by name. Ids (which
   * start with `vsec_`) match exactly; otherwise the value is matched against
   * secret names (case-insensitive), which is how agents usually refer to them
   * ("GitHub" rather than `vsec_...`).
   */
  getSecret(nameOrId: string): DecryptedSecret {
    const byId = this._byId.get(nameOrId);
    if (byId) return byId;

    const lower = nameOrId.toLowerCase();
    const byName = [...this._byId.values()].filter((s) => s.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      throw new VaultSecretTypeError(
        `Multiple secrets are named '${nameOrId}'. Use the secret id (vsec_...) to disambiguate.`
      );
    }
    throw new VaultSecretNotFoundError(`No secret named or identified by '${nameOrId}' in the unlocked vault.`);
  }

  /** Get a decrypted secret by its name (case-insensitive). */
  getByName(name: string): DecryptedSecret {
    return this.getSecret(name);
  }

  private getTyped<T extends SecretPayload>(nameOrId: string, type: VaultSecretType): T {
    const secret = this.getSecret(nameOrId);
    if (secret.type !== type) {
      throw new VaultSecretTypeError(`Secret '${secret.name}' is of type '${secret.type}', not '${type}'.`);
    }
    return secret.payload as T;
  }

  /** Get the login payload for a `login` secret, by id or name. */
  getLogin(nameOrId: string): LoginPayload {
    return this.getTyped<LoginPayload>(nameOrId, VaultSecretType.LOGIN);
  }

  /** Get the payload for an `api_key` secret, by id or name. */
  getApiKey(nameOrId: string): ApiKeyPayload {
    return this.getTyped<ApiKeyPayload>(nameOrId, VaultSecretType.API_KEY);
  }

  /** Get the payload for an `other` secret, by id or name. */
  getOther(nameOrId: string): OtherPayload {
    return this.getTyped<OtherPayload>(nameOrId, VaultSecretType.OTHER);
  }

  /** Current TOTP code for a `login` secret that has TOTP configured, by id or name. */
  async getTotpCode(nameOrId: string): Promise<TOTPCode> {
    const secret = this.getSecret(nameOrId);
    const login = this.getLogin(secret.id);
    if (!login.totp) {
      throw new VaultSecretTypeError(`Secret '${secret.name}' has no TOTP configured.`);
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

  /** Update a secret's metadata and/or payload, by id or name. Re-encrypts when a payload is given. Admin only. */
  async updateSecret(
    nameOrId: string,
    changes: { name?: string; description?: string | null; payload?: SecretPayload }
  ): Promise<DecryptedSecret> {
    const target = this.getSecret(nameOrId);
    const body: Record<string, unknown> = {};
    if (changes.name !== undefined) body.name = changes.name;
    if (changes.description !== undefined) body.description = changes.description;
    if (changes.payload !== undefined) {
      body.encrypted_payload = await encryptPayload(this._orgKey, changes.payload, target.id);
    }

    const summary = await this._http.patch<VaultSecretSummary>(
      `${BASE}/secrets/${encodeURIComponent(target.id)}`,
      body
    );

    const payload = changes.payload ?? target.payload;
    const secret: DecryptedSecret = { ...summary, payload };
    this._byId.set(secret.id, secret);
    return secret;
  }

  /** Delete a secret (and its access grants), by id or name. Admin only. */
  async deleteSecret(nameOrId: string): Promise<void> {
    const target = this.getSecret(nameOrId);
    await this._http.delete<void>(`${BASE}/secrets/${encodeURIComponent(target.id)}`);
    this._byId.delete(target.id);
  }
}
