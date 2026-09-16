import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AgentIdentity } from "../src/identity.js";
import { HttpTransport } from "../src/http.js";

describe("Wirebox Tunnels Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("tunnels.list() sends GET /v1/tunnels with query filters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        tunnels: [
          {
            id: "tun_123",
            organization_id: "org_456",
            agent_identity_id: "agt_789",
            agent_handle: "sales-bot",
            public_url: "https://sales-bot.wirebox.run",
            public_host: "sales-bot.wirebox.run",
            status: "active",
            is_connected: true,
            connected_clients: 1,
            connected_at: "2026-09-16T12:00:00Z",
            disconnected_at: null,
            client: {
              ip: "127.0.0.1",
              version: "wirebox-cli/0.1.0",
              forward_to: "http://localhost:3000",
            },
            last_request_at: null,
            created_at: "2026-09-16T12:00:00Z",
            updated_at: "2026-09-16T12:00:00Z",
          },
        ],
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const tunnels = await client.tunnels.list({ is_connected: true, status: "active", limit: 10 });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/tunnels?is_connected=true&status=active&limit=10",
      expect.objectContaining({ method: "GET" })
    );
    expect(tunnels).toHaveLength(1);
    expect(tunnels[0]?.agent_handle).toBe("sales-bot");
    expect(tunnels[0]?.public_url).toBe("https://sales-bot.wirebox.run");
  });

  it("tunnels.get() retrieves a single tunnel by handle or ID", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "tun_123",
        organization_id: "org_456",
        agent_identity_id: "agt_789",
        agent_handle: "sales-bot",
        public_url: "https://sales-bot.wirebox.run",
        public_host: "sales-bot.wirebox.run",
        status: "active",
        is_connected: false,
        connected_clients: 0,
        connected_at: null,
        disconnected_at: null,
        client: null,
        last_request_at: null,
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const tunnel = await client.tunnels.get("@sales-bot");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/tunnels/sales-bot",
      expect.objectContaining({ method: "GET" })
    );
    expect(tunnel.id).toBe("tun_123");
    expect(tunnel.agent_handle).toBe("sales-bot");
  });

  it("tunnels.update() sends PATCH /v1/tunnels/:handle to update status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "tun_123",
        organization_id: "org_456",
        agent_identity_id: "agt_789",
        agent_handle: "sales-bot",
        public_url: "https://sales-bot.wirebox.run",
        public_host: "sales-bot.wirebox.run",
        status: "disabled",
        is_connected: false,
        connected_clients: 0,
        connected_at: null,
        disconnected_at: null,
        client: null,
        last_request_at: null,
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:05:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const updated = await client.tunnels.update("sales-bot", { status: "disabled" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/tunnels/sales-bot",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "disabled" }),
      })
    );
    expect(updated.status).toBe("disabled");
  });

  it("AgentIdentity embeds tunnel summary and provides getTunnel()", async () => {
    const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_key" });
    const agent = new AgentIdentity(
      {
        id: "agt_123",
        organization_id: "org_456",
        agent_handle: "support-bot",
        display_name: "Support Bot",
        description: null,
        status: "active",
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
        tunnel: {
          id: "tun_789",
          public_url: "https://support-bot.wirebox.run",
          status: "active",
          is_connected: false,
        },
      },
      http
    );

    expect(agent.tunnel.id).toBe("tun_789");
    expect(agent.tunnel.public_url).toBe("https://support-bot.wirebox.run");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "tun_789",
        organization_id: "org_456",
        agent_identity_id: "agt_123",
        agent_handle: "support-bot",
        public_url: "https://support-bot.wirebox.run",
        public_host: "support-bot.wirebox.run",
        status: "active",
        is_connected: true,
        connected_clients: 1,
        connected_at: "2026-09-16T12:00:00Z",
        disconnected_at: null,
        client: {
          ip: "10.0.0.1",
          version: "wirebox-cli/0.1.0",
          forward_to: "http://localhost:8000",
        },
        last_request_at: null,
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
      }),
    } as Response);

    const fullTunnel = await agent.getTunnel();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/identities/support-bot/tunnel",
      expect.objectContaining({ method: "GET" })
    );
    expect(fullTunnel.is_connected).toBe(true);
    expect(fullTunnel.client?.forward_to).toBe("http://localhost:8000");
  });

  it("tunnels.connect() supports in-memory handler proxying", async () => {
    // Mock get tunnel lookup
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "tun_123",
        organization_id: "org_456",
        agent_identity_id: "agt_789",
        agent_handle: "sales-bot",
        public_url: "https://sales-bot.wirebox.run",
        public_host: "sales-bot.wirebox.run",
        status: "active",
        is_connected: false,
        connected_clients: 0,
        connected_at: null,
        disconnected_at: null,
        client: null,
        last_request_at: null,
        created_at: "2026-09-16T12:00:00Z",
        updated_at: "2026-09-16T12:00:00Z",
      }),
    } as Response);

    // Mock WebSocket implementation
    class MockWebSocket {
      url: string;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      sentMessages: string[] = [];

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.onopen?.();
        }, 10);
      }

      send(data: string) {
        this.sentMessages.push(data);
      }

      close() {
        this.onclose?.();
      }
    }

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const session = await client.tunnels.connect("sales-bot", {
      WebSocket: MockWebSocket,
      handler: async (req) => {
        expect(req.method).toBe("POST");
        const body = await req.json();
        return new Response(JSON.stringify({ greeting: `Hello, ${body.name}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(session.publicUrl).toBe("https://sales-bot.wirebox.run");
    expect(session.isConnected).toBe(true);

    await session.close();
  });
});
