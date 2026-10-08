import { describe, it, expect } from "vitest";
import { TOTPAlgorithm, generateTotp, parseTotpUri } from "../../src/vault/totp.js";

// RFC 6238 Appendix B reference seed "12345678901234567890" (ASCII) in base32.
const RFC_SECRET_SHA1 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("generateTotp — RFC 6238 SHA1 test vectors (8 digits)", () => {
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];

  for (const [seconds, expected] of vectors) {
    it(`T=${seconds}s → ${expected}`, async () => {
      const { code } = await generateTotp(
        { secret: RFC_SECRET_SHA1, algorithm: TOTPAlgorithm.SHA1, digits: 8, period: 30 },
        seconds * 1000
      );
      expect(code).toBe(expected);
    });
  }
});

describe("generateTotp — formatting", () => {
  it("6-digit code is the low 6 digits of the 8-digit code", async () => {
    const at = 59 * 1000;
    const six = await generateTotp({ secret: RFC_SECRET_SHA1, digits: 6, period: 30 }, at);
    expect(six.code).toBe("287082");
    expect(six.digits).toBe(6);
  });

  it("reports whole seconds until rollover", async () => {
    const { expiresInSeconds } = await generateTotp({ secret: RFC_SECRET_SHA1, period: 30 }, 50 * 1000);
    expect(expiresInSeconds).toBe(10); // 50s elapsed → 10s left in the 30s window
  });

  it("defaults to sha1 / 6 digits / 30s", async () => {
    const { digits, period } = await generateTotp({ secret: RFC_SECRET_SHA1 }, 0);
    expect(digits).toBe(6);
    expect(period).toBe(30);
  });
});

describe("generateTotp — validation", () => {
  it("rejects a non-base32 secret", async () => {
    await expect(generateTotp({ secret: "not base32 !!!" }, 0)).rejects.toThrow(/base32/);
  });

  it("rejects invalid digits / period", async () => {
    await expect(generateTotp({ secret: RFC_SECRET_SHA1, digits: 7 }, 0)).rejects.toThrow(/digits/);
    await expect(generateTotp({ secret: RFC_SECRET_SHA1, period: 45 }, 0)).rejects.toThrow(/period/);
  });
});

describe("parseTotpUri", () => {
  it("parses secret, algorithm, digits, and period", () => {
    const config = parseTotpUri(
      "otpauth://totp/Example:eva@example.com?secret=" +
        RFC_SECRET_SHA1 +
        "&issuer=Example&algorithm=SHA256&digits=8&period=60"
    );
    expect(config.secret).toBe(RFC_SECRET_SHA1);
    expect(config.algorithm).toBe("sha256");
    expect(config.digits).toBe(8);
    expect(config.period).toBe(60);
  });

  it("normalizes optional fields to their defaults when absent", () => {
    const config = parseTotpUri("otpauth://totp/Acme?secret=" + RFC_SECRET_SHA1);
    expect(config.secret).toBe(RFC_SECRET_SHA1);
    expect(config.algorithm).toBe("sha1");
    expect(config.digits).toBe(6);
    expect(config.period).toBe(30);
  });

  it("rejects a non-otpauth URI and a missing secret", () => {
    expect(() => parseTotpUri("https://example.com")).toThrow();
    expect(() => parseTotpUri("otpauth://totp/Acme?issuer=Acme")).toThrow(/secret/);
  });

  it("round-trips through generateTotp", async () => {
    const config = parseTotpUri(
      "otpauth://totp/Acme?secret=" + RFC_SECRET_SHA1 + "&digits=8&period=30"
    );
    const { code } = await generateTotp(config, 59 * 1000);
    expect(code).toBe("94287082");
  });
});
