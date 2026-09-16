import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AgentIdentity } from "../src/identity.js";
import { HttpTransport } from "../src/http.js";
import { verifyWebhook } from "../src/verify_webhook.js";

describe("Wirebox Webhooks Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("webhooks.create() sends POST /v1/webhooks and returns secret", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "whk_123",
        agent_handle: "sales-bot",
        mailbox_address: "sales-bot@wireboxmail.com",
        url: "https://agent.example.com/webhook",
        events: ["message.received"],
        auth_token: "bearer_123",
        has_auth_token: true,
        status: "active",
        secret: "whsec_test_secret_abc123",
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    const res = await client.webhooks.create({
      url: "https://agent.example.com/webhook",
      events: ["message.received"],
      agent: "@sales-bot",
      auth_token: "bearer_123",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://agent.example.com/webhook",
          events: ["message.received"],
          agent: "sales-bot",
          auth_token: "bearer_123",
        }),
      })
    );
    expect(res.id).toBe("whk_123");
    expect(res.secret).toBe("whsec_test_secret_abc123");
    expect(res.agent_handle).toBe("sales-bot");
  });

  it("webhooks.list() sends GET /v1/webhooks with filters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        webhooks: [
          {
            id: "whk_123",
            agent_handle: "sales-bot",
            mailbox_address: "sales-bot@wireboxmail.com",
            url: "https://agent.example.com/webhook",
            events: ["message.received"],
            auth_token: null,
            has_auth_token: false,
            status: "active",
            created_at: "2026-09-16T12:00:00Z",
            updated_at: "2026-09-16T12:00:00Z",
          },
        ],
        total: 1,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    const hooks = await client.webhooks.list({ agent: "@sales-bot", event: "message.received" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks?agent=sales-bot&event=message.received",
      expect.objectContaining({ method: "GET" })
    );
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.id).toBe("whk_123");
  });

  it("webhooks.get() retrieves single webhook by id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "whk_123",
        agent_handle: "sales-bot",
        mailbox_address: null,
        url: "https://agent.example.com/webhook",
        events: ["*"],
        auth_token: null,
        has_auth_token: false,
        status: "active",
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    const hook = await client.webhooks.get("whk_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks/whk_123",
      expect.objectContaining({ method: "GET" })
    );
    expect(hook.id).toBe("whk_123");
    expect(hook.events).toEqual(["*"]);
  });

  it("webhooks.update() sends PATCH /v1/webhooks/:id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "whk_123",
        status: "paused",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    const hook = await client.webhooks.update("whk_123", { status: "paused" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks/whk_123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      })
    );
    expect(hook.status).toBe("paused");
  });

  it("webhooks.delete() sends DELETE /v1/webhooks/:id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => "",
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    await client.webhooks.delete("whk_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks/whk_123",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("webhooks.test() sends POST /v1/webhooks/:id/test", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        webhook_id: "whk_123",
        url: "https://agent.example.com/webhook",
        event_type: "test.ping",
        status_code: 200,
        latency_ms: 45,
        success: true,
        error: null,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    const result = await client.webhooks.test("whk_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks/whk_123/test",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.success).toBe(true);
    expect(result.status_code).toBe(200);
  });

  it("webhooks.rotateSecret() sends POST /v1/webhooks/:id/rotate-secret", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "whk_123",
        secret: "whsec_new_rotated_secret_999",
        updated_at: "2026-09-16T12:30:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test" });
    const result = await client.webhooks.rotateSecret("whk_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/webhooks/whk_123/rotate-secret",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.secret).toBe("whsec_new_rotated_secret_999");
  });

  it("AgentIdentity.createWebhook() and listWebhooks() automatically scope to the agent", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_test" });
    const postSpy = vi.spyOn(transport, "post").mockResolvedValueOnce({
      id: "whk_agent_1",
      agent_handle: "sales-bot",
      url: "https://agent.example.com/hook",
      events: ["message.received"],
      secret: "whsec_agent_secret",
    } as any);

    const getSpy = vi.spyOn(transport, "get").mockResolvedValueOnce({
      webhooks: [{ id: "whk_agent_1" }],
    } as any);

    const agent = new AgentIdentity(
      {
        id: "agt_1",
        organization_id: "org_1",
        agent_handle: "sales-bot",
        display_name: "Sales Bot",
        description: null,
        status: "active",
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
        mailboxes: [{ id: "mbx_1", email_address: "sales-bot@wireboxmail.com", created_at: "2026-09-16T12:00:00Z" }],
      },
      transport
    );

    const created = await agent.createWebhook({
      url: "https://agent.example.com/hook",
      events: ["message.received"],
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/v1/webhooks",
      expect.objectContaining({ agent: "sales-bot", url: "https://agent.example.com/hook" }),
      undefined
    );
    expect(created.secret).toBe("whsec_agent_secret");

    const list = await agent.listWebhooks();
    expect(getSpy).toHaveBeenCalledWith(
      "/v1/webhooks",
      expect.objectContaining({ agent: "sales-bot" }),
      undefined
    );
    expect(list).toHaveLength(1);
  });
});

describe("verifyWebhook()", () => {
  const secret = "whsec_test_secret_key_12345";
  const requestId = "req_01J8TEST123456";
  const rawBody = JSON.stringify({ event_type: "message.received", data: { foo: "bar" } });

  async function computeSignature(secretKey: string, reqId: string, timestamp: string, body: string) {
    const encoder = new TextEncoder();
    const signedString = `${reqId}.${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signedString));
    const hashArray = Array.from(new Uint8Array(signature));
    return `sha256=${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  it("verifies a valid signature with options object", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeSignature(secret, requestId, timestamp, rawBody);

    const isValid = await verifyWebhook({
      payload: rawBody,
      headers: {
        "x-wirebox-signature": sig,
        "x-wirebox-request-id": requestId,
        "x-wirebox-timestamp": timestamp,
      },
      secret,
    });

    expect(isValid).toBe(true);
  });

  it("verifies a valid signature passing standard Request instance", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeSignature(secret, requestId, timestamp, rawBody);

    const req = new Request("https://localhost/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Wirebox-Signature": sig,
        "X-Wirebox-Request-ID": requestId,
        "X-Wirebox-Timestamp": timestamp,
      },
      body: rawBody,
    });

    const isValid = await verifyWebhook(req, secret);
    expect(isValid).toBe(true);
  });

  it("rejects tampered body", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeSignature(secret, requestId, timestamp, rawBody);

    const isValid = await verifyWebhook({
      payload: rawBody + "tampered",
      headers: {
        "x-wirebox-signature": sig,
        "x-wirebox-request-id": requestId,
        "x-wirebox-timestamp": timestamp,
      },
      secret,
    });

    expect(isValid).toBe(false);
  });

  it("rejects expired timestamp (clock skew > tolerance)", async () => {
    // 10 minutes ago
    const timestamp = Math.floor((Date.now() - 600_000) / 1000).toString();
    const sig = await computeSignature(secret, requestId, timestamp, rawBody);

    const isValid = await verifyWebhook({
      payload: rawBody,
      headers: {
        "x-wirebox-signature": sig,
        "x-wirebox-request-id": requestId,
        "x-wirebox-timestamp": timestamp,
      },
      secret,
      toleranceMs: 300_000,
    });

    expect(isValid).toBe(false);
  });

  it("rejects wrong secret", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeSignature(secret, requestId, timestamp, rawBody);

    const isValid = await verifyWebhook({
      payload: rawBody,
      headers: {
        "x-wirebox-signature": sig,
        "x-wirebox-request-id": requestId,
        "x-wirebox-timestamp": timestamp,
      },
      secret: "whsec_wrong_secret",
    });

    expect(isValid).toBe(false);
  });
});
