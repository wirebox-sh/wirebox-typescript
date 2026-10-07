import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpTransport } from "../src/http.js";
import { AgentIdentity } from "../src/identity.js";
import type { IdentityData } from "../src/types.js";

describe("AgentIdentity Message Search", () => {
  const sampleIdentity: IdentityData = {
    id: "agt_01j9876543210fedcba",
    organization_id: "org_01j1234567890abcdef",
    agent_handle: "sales-bot",
    display_name: "Sales Assistant",
    description: null,
    status: "active",
    created_at: "2026-09-14T10:00:00Z",
    updated_at: "2026-09-14T10:00:00Z",
    mailboxes: [
      {
        id: "mbx_123",
        email_address: "sales-bot@wireboxmail.com",
        created_at: "2026-09-14T10:00:00Z",
      },
    ],
  };

  let transport: HttpTransport;
  let agent: AgentIdentity;

  beforeEach(() => {
    transport = new HttpTransport({
      baseUrl: "https://api.wirebox.sh",
      apiKey: "wb_live_test_123",
    });
    agent = new AgentIdentity(sampleIdentity, transport);
    vi.restoreAllMocks();
  });

  it("searchMessages() sends GET with q and limit", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        items: [],
        messages: [
          {
            id: "msg_001",
            direction: "inbound",
            subject: "Invoice follow-up",
            from_address: "billing@vendor.com",
            to_addresses: ["sales-bot@wireboxmail.com"],
            snippet: "invoice #1042 is now overdue",
            highlight: "invoice #1042 is now <b>overdue</b>",
            is_read: false,
            is_starred: false,
            has_attachments: false,
            status: "received",
            created_at: "2026-09-14T11:00:00Z",
          },
        ],
        count: 1,
      }),
    } as Response);

    const result = await agent.searchMessages({ q: "invoice", limit: 5 });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/search?q=invoice&limit=5",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.count).toBe(1);
    expect(result.messages[0]?.highlight).toContain("overdue");
  });

  it("searchMessages() omits limit when not provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ messages: [], count: 0 }),
    } as Response);

    const result = await agent.searchMessages({ q: "no-match" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/search?q=no-match",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.messages.length).toBe(0);
  });
});
