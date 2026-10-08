import { describe, it, expect } from "vitest";
import {
  DEFAULT_KDF_PARAMS,
  computeAuthHash,
  createVaultInitMaterial,
  decryptPayload,
  deriveMasterKey,
  encryptPayload,
  fromBase64,
  generateOrgKey,
  generateSalt,
  generateVaultKey,
  toBase64,
  unwrapOrgKey,
  wrapOrgKey,
} from "../../src/vault/crypto.js";

const VAULT_KEY = "WBV-TEST-KEY-abc123!";

describe("base64 round-trip", () => {
  it("encodes and decodes arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });
});

describe("generateVaultKey", () => {
  it("produces a prefixed, grouped, high-entropy key", () => {
    const key = generateVaultKey();
    expect(key).toMatch(/^WBV(-[0-9A-Z]{1,4})+$/);
    expect(generateVaultKey()).not.toEqual(generateVaultKey());
  });
});

describe("deriveMasterKey + computeAuthHash", () => {
  it("is deterministic for the same key + salt", async () => {
    const salt = generateSalt();
    const a = await deriveMasterKey(VAULT_KEY, salt);
    const b = await deriveMasterKey(VAULT_KEY, salt);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a).toHaveLength(32);
    expect(await computeAuthHash(a)).toEqual(await computeAuthHash(b));
  });

  it("differs for a different salt", async () => {
    const mkA = await deriveMasterKey(VAULT_KEY, generateSalt());
    const mkB = await deriveMasterKey(VAULT_KEY, generateSalt());
    expect(Array.from(mkA)).not.toEqual(Array.from(mkB));
  });

  it("differs for a different vault key", async () => {
    const salt = generateSalt();
    const mkA = await deriveMasterKey(VAULT_KEY, salt);
    const mkB = await deriveMasterKey("WBV-OTHER-KEY-xyz987!", salt);
    expect(Array.from(mkA)).not.toEqual(Array.from(mkB));
  });

  it("produces a 64-char hex auth hash", async () => {
    const hash = await computeAuthHash(await deriveMasterKey(VAULT_KEY, generateSalt()));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("OEK wrap / unwrap", () => {
  it("round-trips the org key", async () => {
    const masterKey = await deriveMasterKey(VAULT_KEY, generateSalt());
    const orgKey = generateOrgKey();
    const unwrapped = await unwrapOrgKey(masterKey, await wrapOrgKey(masterKey, orgKey));
    expect(Array.from(unwrapped)).toEqual(Array.from(orgKey));
  });

  it("fails to unwrap with the wrong master key", async () => {
    const salt = generateSalt();
    const masterKey = await deriveMasterKey(VAULT_KEY, salt);
    const wrongKey = await deriveMasterKey("WBV-WRONG-KEY-000000!", salt);
    const wrapped = await wrapOrgKey(masterKey, generateOrgKey());
    await expect(unwrapOrgKey(wrongKey, wrapped)).rejects.toThrow();
  });
});

describe("payload encrypt / decrypt", () => {
  it("round-trips a login payload", async () => {
    const orgKey = generateOrgKey();
    const payload = { username: "eva", password: "s3cr3t", service_url: "https://example.com" };
    const blob = await encryptPayload(orgKey, payload, "vsec_1");
    expect(await decryptPayload(orgKey, blob, "vsec_1")).toEqual(payload);
  });

  it("fails when the secret id (AAD) does not match", async () => {
    const orgKey = generateOrgKey();
    const blob = await encryptPayload(orgKey, { data: "x" }, "vsec_1");
    await expect(decryptPayload(orgKey, blob, "vsec_2")).rejects.toThrow();
  });

  it("fails with a different org key", async () => {
    const blob = await encryptPayload(generateOrgKey(), { data: "x" }, "vsec_1");
    await expect(decryptPayload(generateOrgKey(), blob, "vsec_1")).rejects.toThrow();
  });

  it("rejects a tampered version byte", async () => {
    const orgKey = generateOrgKey();
    const blob = await encryptPayload(orgKey, { data: "x" }, "vsec_1");
    const bytes = fromBase64(blob);
    bytes[0] = 9; // bogus version
    await expect(decryptPayload(orgKey, toBase64(bytes), "vsec_1")).rejects.toThrow(/version/);
  });
});

describe("createVaultInitMaterial", () => {
  it("produces server material that a matching vault key can unlock", async () => {
    const { material, orgKey } = await createVaultInitMaterial(VAULT_KEY);
    expect(material.kdfParams).toEqual(DEFAULT_KDF_PARAMS);
    expect(material.authHash).toMatch(/^[0-9a-f]{64}$/);

    // Re-derive as a client would at unlock: salt + params from the server.
    const masterKey = await deriveMasterKey(VAULT_KEY, fromBase64(material.kdfSalt), material.kdfParams);
    expect(await computeAuthHash(masterKey)).toEqual(material.authHash);
    const unwrapped = await unwrapOrgKey(masterKey, material.wrappedOrgKey);
    expect(Array.from(unwrapped)).toEqual(Array.from(orgKey));
  });

  it("yields an auth hash that a wrong key cannot reproduce", async () => {
    const { material } = await createVaultInitMaterial(VAULT_KEY);
    const wrongMaster = await deriveMasterKey("WBV-NOPE-000000000000!", fromBase64(material.kdfSalt), material.kdfParams);
    expect(await computeAuthHash(wrongMaster)).not.toEqual(material.authHash);
  });
});
