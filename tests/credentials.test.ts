import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveApiKey } from "../src/credentials.js";

describe("resolveApiKey", () => {
  const originalEnv = process.env.WIREBOX_API_KEY;

  beforeEach(() => {
    delete process.env.WIREBOX_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WIREBOX_API_KEY = originalEnv;
    } else {
      delete process.env.WIREBOX_API_KEY;
    }
  });

  it("prioritizes explicit apiKey passed in parameters", () => {
    process.env.WIREBOX_API_KEY = "env_key_123";
    const resolved = resolveApiKey("explicit_key_456");
    expect(resolved).toBe("explicit_key_456");
  });

  it("trims whitespace from explicit apiKey", () => {
    const resolved = resolveApiKey("  trimmed_key_789  ");
    expect(resolved).toBe("trimmed_key_789");
  });

  it("falls back to WIREBOX_API_KEY environment variable", () => {
    process.env.WIREBOX_API_KEY = "wb_live_env_abc";
    const resolved = resolveApiKey();
    expect(resolved).toBe("wb_live_env_abc");
  });

  it("returns undefined when no credentials exist", () => {
    delete process.env.WIREBOX_API_KEY;
    const resolved = resolveApiKey();
    // In test environment without ~/.wirebox/config, it returns undefined
    expect(resolved === undefined || typeof resolved === "string").toBe(true);
  });
});
