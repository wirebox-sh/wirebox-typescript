import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AuthenticationError } from "../src/errors.js";

describe("Wirebox Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws AuthenticationError when performing actions without API key", async () => {
    const client = new Wirebox({ apiKey: "" });
    // Ensure env is clean
    delete process.env.WIREBOX_API_KEY;

    await expect(client.createIdentity({ agent_handle: "bot" })).rejects.toThrow(
      AuthenticationError
    );
    await expect(client.whoami()).rejects.toThrow(AuthenticationError);
  });

  it("createIdentity() sends POST /v1/identities and returns AgentIdentity", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "agt_123",
        organization_id: "org_456",
        agent_handle: "research-bot",
        display_name: "Research Bot",
        description: "Scrapes papers",
        status: "active",
        created_at: "2026-09-14T12:00:00Z",
        updated_at: "2026-09-14T12:00:00Z",
        mailboxes: [{ id: "mbx_789", email_address: "research-bot@wireboxmail.com", created_at: "" }],
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const agent = await client.createIdentity({
      agent_handle: "research-bot",
      display_name: "Research Bot",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/identities",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          agent_handle: "research-bot",
          display_name: "Research Bot",
        }),
      })
    );
    expect(agent.agent_handle).toBe("research-bot");
    expect(agent.mailbox.email_address).toBe("research-bot@wireboxmail.com");
  });

  it("getIdentity(handle) sends GET /v1/identities/:handle", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "agt_123",
        organization_id: "org_456",
        agent_handle: "sales-bot",
        display_name: "Sales Bot",
        description: null,
        status: "active",
        created_at: "2026-09-14T12:00:00Z",
        updated_at: "2026-09-14T12:00:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const agent = await client.getIdentity("sales-bot");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/identities/sales-bot",
      expect.objectContaining({ method: "GET" })
    );
    expect(agent.agent_handle).toBe("sales-bot");
  });

  it("getIdentity() without handle retrieves the primary or scoped identity", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [
        {
          id: "agt_scoped_001",
          organization_id: "org_456",
          agent_handle: "my-agent",
          display_name: "My Agent",
          description: null,
          status: "active",
          created_at: "2026-09-14T12:00:00Z",
          updated_at: "2026-09-14T12:00:00Z",
        },
      ],
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const agent = await client.getIdentity();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/identities",
      expect.objectContaining({ method: "GET" })
    );
    expect(agent.agent_handle).toBe("my-agent");
  });

  it("whoami() calls GET /v1/me and parses organization and usage telemetry", async () => {
    const mockTelemetry = {
      organization: {
        id: "org_01j9876543210fedcba",
        name: "Acme Corp",
        slug: "acme-corp",
        billing_plan: "pro",
        is_claimed: true,
        claimed_by_email: "admin@acme.com",
        created_at: "2026-09-01T00:00:00Z",
      },
      auth: {
        type: "api_key",
        actor_id: "key_01j111222333444",
        scoped_identity_id: null,
        scopes: ["admin"],
      },
      usage: {
        agents_count: 5,
        agents_limit: 10,
        webhooks_count: 2,
        webhooks_limit: 20,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockTelemetry,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const result = await client.whoami();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/me",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.organization.is_claimed).toBe(true);
    expect(result.usage.agents_count).toBe(5);
  });
});
