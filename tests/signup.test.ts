import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";

describe("Agent Self-Signup & Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Wirebox.signup() calls POST /v1/agent-signup without requiring API key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        api_key: "wb_live_fresh_123456",
        email_address: "agent-a1b2c3@wireboxmail.com",
      }),
    } as Response);

    const res = await Wirebox.signup({
      human_email: "supervisor@company.com",
      display_name: "Assistant Bot",
      note_to_human: "Please verify me!",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/agent-signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          human_email: "supervisor@company.com",
          display_name: "Assistant Bot",
          note_to_human: "Please verify me!",
        }),
      })
    );
    expect(res.api_key).toBe("wb_live_fresh_123456");
    expect(res.email_address).toBe("agent-a1b2c3@wireboxmail.com");
  });

  it("Wirebox.verifySignup() sends OTP verification with apiKey in Authorization header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ verified: true }),
    } as Response);

    const res = await Wirebox.verifySignup("wb_live_fresh_123456", {
      verification_code: "123456",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/agent-signup/verify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer wb_live_fresh_123456",
        }),
        body: JSON.stringify({
          code: "123456",
          verification_code: "123456",
        }),
      })
    );
    expect(res.verified).toBe(true);
  });

  it("client.verifySignup() uses internal apiKey", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ verified: true }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_client_key" });
    const res = await client.verifySignup({ verification_code: "654321" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/agent-signup/verify",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer wb_live_client_key",
        }),
      })
    );
    expect(res.verified).toBe(true);
  });
});
