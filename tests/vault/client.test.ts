import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Wirebox } from "../../src/client.js";
import {
  InvalidVaultKeyError,
  VaultNotInitializedError,
  VaultSecretNotFoundError,
  VaultSecretTypeError,
} from "../../src/errors.js";
import { VaultSecretType } from "../../src/vault/types.js";

/**
 * An in-memory fake of the Wirebox Vault API. It stores exactly what the real
 * server stores — ciphertext + metadata + the auth hash — and never does any
 * crypto itself, so the SDK's encrypt→store→unlock→decrypt round-trip is
 * exercised end-to-end without a network or database.
 */
function fakeVaultServer() {
  interface StoredSecret {
    id: string;
    type: string;
    name: string;
    description: string | null;
    encrypted_payload: string;
  }
  const state: {
    vault: { kdf_salt: string; kdf_params: unknown; wrapped_org_key: string; auth_hash: string } | null;
    secrets: StoredSecret[];
    access: Array<{ id: string; secret_id: string; identity_id: string; created_at: string }>;
  } = { vault: null, secrets: [], access: [] };

  const json = (status: number, body: unknown): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response;

  const noContent = (): Response =>
    ({ ok: true, status: 204, headers: new Headers(), json: async () => ({}), text: async () => "" }) as Response;

  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const path = url.pathname;
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : {};

    // GET /v1/vault
    if (path === "/v1/vault" && method === "GET") {
      if (!state.vault) return json(200, { initialized: false });
      return json(200, {
        initialized: true,
        id: "vlt_test",
        kdf_salt: state.vault.kdf_salt,
        kdf_params: state.vault.kdf_params,
      });
    }

    // POST /v1/vault/initialize
    if (path === "/v1/vault/initialize" && method === "POST") {
      if (state.vault) return json(409, { error: { code: "vault_already_initialized", message: "exists" } });
      state.vault = {
        kdf_salt: body.kdf_salt,
        kdf_params: body.kdf_params,
        wrapped_org_key: body.wrapped_org_key,
        auth_hash: body.auth_hash,
      };
      return json(201, { initialized: true, id: "vlt_test", kdf_salt: body.kdf_salt, kdf_params: body.kdf_params });
    }

    // GET /v1/vault/unlock?auth_hash=
    if (path === "/v1/vault/unlock" && method === "GET") {
      if (!state.vault) return json(404, { error: { code: "vault_not_initialized", message: "none" } });
      if (url.searchParams.get("auth_hash") !== state.vault.auth_hash) {
        return json(401, { error: { code: "invalid_vault_key", message: "no match" } });
      }
      return json(200, {
        wrapped_org_key: state.vault.wrapped_org_key,
        kdf_params: state.vault.kdf_params,
        secrets: state.secrets,
      });
    }

    // GET /v1/vault/secrets
    if (path === "/v1/vault/secrets" && method === "GET") {
      const type = url.searchParams.get("type");
      const rows = state.secrets
        .filter((s) => !type || s.type === type)
        .map(({ encrypted_payload, ...meta }) => ({ ...meta, created_at: "t", updated_at: "t" }));
      return json(200, { secrets: rows });
    }

    // POST /v1/vault/secrets
    if (path === "/v1/vault/secrets" && method === "POST") {
      state.secrets.push({
        id: body.id,
        type: body.type,
        name: body.name,
        description: body.description ?? null,
        encrypted_payload: body.encrypted_payload,
      });
      return json(201, {
        id: body.id,
        type: body.type,
        name: body.name,
        description: body.description ?? null,
        created_at: "t",
        updated_at: "t",
      });
    }

    const secretMatch = path.match(/^\/v1\/vault\/secrets\/([^/]+)$/);
    if (secretMatch) {
      const id = decodeURIComponent(secretMatch[1]!);
      const secret = state.secrets.find((s) => s.id === id);
      if (method === "PATCH") {
        if (!secret) return json(404, { error: { code: "secret_not_found", message: "no" } });
        if (body.name !== undefined) secret.name = body.name;
        if (body.description !== undefined) secret.description = body.description;
        if (body.encrypted_payload !== undefined) secret.encrypted_payload = body.encrypted_payload;
        return json(200, {
          id: secret.id,
          type: secret.type,
          name: secret.name,
          description: secret.description,
          created_at: "t",
          updated_at: "t2",
        });
      }
      if (method === "DELETE") {
        state.secrets = state.secrets.filter((s) => s.id !== id);
        return noContent();
      }
    }

    const accessMatch = path.match(/^\/v1\/vault\/secrets\/([^/]+)\/access$/);
    if (accessMatch) {
      const secretId = decodeURIComponent(accessMatch[1]!);
      if (method === "GET") {
        return json(200, { access: state.access.filter((a) => a.secret_id === secretId) });
      }
      if (method === "POST") {
        const grant = {
          id: `vacc_${state.access.length + 1}`,
          secret_id: secretId,
          identity_id: body.identity_id,
          created_at: "t",
        };
        state.access.push(grant);
        return json(201, grant);
      }
    }

    const revokeMatch = path.match(/^\/v1\/vault\/secrets\/([^/]+)\/access\/([^/]+)$/);
    if (revokeMatch && method === "DELETE") {
      const [, secretId, identityId] = revokeMatch;
      state.access = state.access.filter(
        (a) => !(a.secret_id === decodeURIComponent(secretId!) && a.identity_id === decodeURIComponent(identityId!))
      );
      return noContent();
    }

    return json(404, { error: { code: "NOT_FOUND", message: `${method} ${path}` } });
  };

  return { fetchImpl, state };
}

describe("VaultClient — end-to-end round-trip (fake server)", () => {
  let server: ReturnType<typeof fakeVaultServer>;
  let client: Wirebox;

  beforeEach(() => {
    server = fakeVaultServer();
    vi.spyOn(globalThis, "fetch").mockImplementation(server.fetchImpl as typeof fetch);
    client = new Wirebox({ apiKey: "wb_live_test" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("reports an uninitialized vault", async () => {
    expect(await client.vault.info()).toEqual({ initialized: false });
  });

  it("initialize() returns a stored vault key and never sends plaintext", async () => {
    const result = await client.vault.initialize();
    expect(result.vaultKey).toMatch(/^WBV-/);
    expect(result.warning).toMatch(/cannot be recovered/i);
    // The server stored only ciphertext + verifier, never the vault key itself.
    expect(server.state.vault?.wrapped_org_key).toBeTruthy();
    expect(server.state.vault?.auth_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(server.state.vault)).not.toContain(result.vaultKey);
  });

  it("round-trips a login secret with TOTP through store + unlock + decrypt", async () => {
    const { vaultKey } = await client.vault.initialize();
    const vault = await client.vault.unlock(vaultKey);

    const created = await vault.createSecret({
      type: VaultSecretType.LOGIN,
      name: "GitHub",
      payload: {
        username: "eva",
        password: "hunter2",
        service_url: "https://github.com",
        totp: { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", digits: 6, period: 30 },
      },
    });
    expect(created.id).toMatch(/^vsec_/);

    // What the server holds is opaque ciphertext — not the password.
    expect(server.state.secrets[0]?.encrypted_payload).not.toContain("hunter2");

    // A fresh unlock must decrypt back to the original plaintext.
    const reopened = await client.vault.unlock(vaultKey);
    const login = reopened.getLogin(created.id);
    expect(login.username).toBe("eva");
    expect(login.password).toBe("hunter2");

    const totp = await reopened.getTotpCode(created.id);
    expect(totp.code).toMatch(/^\d{6}$/);
  });

  it("unlock() with the wrong vault key throws InvalidVaultKeyError", async () => {
    await client.vault.initialize();
    await expect(client.vault.unlock("WBV-WRONG-KEY-0000")).rejects.toBeInstanceOf(InvalidVaultKeyError);
  });

  it("typed getters enforce the secret type and presence", async () => {
    const { vaultKey } = await client.vault.initialize();
    const vault = await client.vault.unlock(vaultKey);
    const apiKey = await vault.createSecret({
      type: VaultSecretType.API_KEY,
      name: "Stripe",
      payload: { key: "sk_live_123", service_url: "https://api.stripe.com" },
    });

    expect(vault.getApiKey(apiKey.id).key).toBe("sk_live_123");
    expect(() => vault.getLogin(apiKey.id)).toThrow(VaultSecretTypeError);
    expect(() => vault.getSecret("vsec_missing")).toThrow(VaultSecretNotFoundError);
  });

  it("updateSecret() re-encrypts and the new plaintext survives a re-unlock", async () => {
    const { vaultKey } = await client.vault.initialize();
    const vault = await client.vault.unlock(vaultKey);
    const secret = await vault.createSecret({
      type: VaultSecretType.OTHER,
      name: "note",
      payload: { data: "v1" },
    });

    await vault.updateSecret(secret.id, { name: "note-renamed", payload: { data: "v2" } });

    const reopened = await client.vault.unlock(vaultKey);
    expect(reopened.getSecret(secret.id).name).toBe("note-renamed");
    expect(reopened.getOther(secret.id).data).toBe("v2");
  });

  it("listSecrets() returns metadata only, filterable by type", async () => {
    const { vaultKey } = await client.vault.initialize();
    const vault = await client.vault.unlock(vaultKey);
    await vault.createSecret({ type: VaultSecretType.LOGIN, name: "a", payload: { username: "u" } });
    await vault.createSecret({ type: VaultSecretType.OTHER, name: "b", payload: { data: "x" } });

    const all = await client.vault.listSecrets();
    expect(all).toHaveLength(2);
    expect(all[0]).not.toHaveProperty("encrypted_payload");

    const logins = await client.vault.listSecrets({ type: VaultSecretType.LOGIN });
    expect(logins).toHaveLength(1);
    expect(logins[0]?.name).toBe("a");
  });

  it("grant / list / revoke access", async () => {
    const { vaultKey } = await client.vault.initialize();
    const vault = await client.vault.unlock(vaultKey);
    const secret = await vault.createSecret({ type: VaultSecretType.OTHER, name: "s", payload: { data: "x" } });

    const grant = await client.vault.grantAccess(secret.id, "agt_bot");
    expect(grant.identity_id).toBe("agt_bot");
    expect(await client.vault.listAccess(secret.id)).toHaveLength(1);

    await client.vault.revokeAccess(secret.id, "agt_bot");
    expect(await client.vault.listAccess(secret.id)).toHaveLength(0);
  });

  it("unlock() on an uninitialized vault throws", async () => {
    await expect(client.vault.unlock("WBV-anything")).rejects.toBeInstanceOf(VaultNotInitializedError);
  });
});
