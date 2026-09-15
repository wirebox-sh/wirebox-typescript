import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpTransport } from "../src/http.js";
import { AgentIdentity } from "../src/identity.js";
import type { IdentityData } from "../src/types.js";

describe("AgentIdentity Email Actions", () => {
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

  it("sendEmail() sends POST to /v1/mailboxes/:address/messages", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message_id: "msg_001",
        mailbox_address: "sales-bot@wireboxmail.com",
        status: "queued",
        created_at: "2026-09-14T12:00:00Z",
      }),
    } as Response);

    const result = await agent.sendEmail({
      to: "customer@example.com",
      subject: "Hello World",
      text: "Test body",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to: "customer@example.com",
          subject: "Hello World",
          text: "Test body",
        }),
      })
    );
    expect(result.message_id).toBe("msg_001");
    expect(result.status).toBe("queued");
  });

  it("listMessages() sends GET with query parameters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        messages: [
          {
            id: "msg_001",
            direction: "inbound",
            subject: "Inquiry",
            from_address: "lead@client.com",
            to_addresses: ["sales-bot@wireboxmail.com"],
            status: "delivered",
            created_at: "2026-09-14T11:00:00Z",
          },
        ],
        total: 1,
      }),
    } as Response);

    const result = await agent.listMessages({ limit: 10, offset: 0 });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/messages?limit=10&offset=0",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.messages.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it("iterMessages() auto-paginates across multiple pages", async () => {
    // Page 1 returns 2 messages, total 3
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          messages: [
            { id: "msg_1", subject: "Msg 1", from_address: "a@a.com", to_addresses: [], status: "delivered", created_at: "", direction: "inbound" },
            { id: "msg_2", subject: "Msg 2", from_address: "b@b.com", to_addresses: [], status: "delivered", created_at: "", direction: "inbound" },
          ],
          total: 3,
        }),
      } as Response)
      // Page 2 returns 1 message, total 3
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          messages: [
            { id: "msg_3", subject: "Msg 3", from_address: "c@c.com", to_addresses: [], status: "delivered", created_at: "", direction: "inbound" },
          ],
          total: 3,
        }),
      } as Response);

    const collected: string[] = [];
    for await (const msg of agent.iterMessages({ limit: 2 })) {
      collected.push(msg.id);
    }

    expect(collected).toEqual(["msg_1", "msg_2", "msg_3"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("getMessage() retrieves full email message body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "msg_001",
        mailbox_id: "mbx_123",
        direction: "inbound",
        from_address: "sender@example.com",
        to_addresses: ["sales-bot@wireboxmail.com"],
        cc_addresses: [],
        bcc_addresses: [],
        reply_to: null,
        subject: "Contract Signed",
        text: "Please find attached the signed contract.",
        html: "<p>Please find attached the signed contract.</p>",
        attachments: [],
        status: "delivered",
        created_at: "2026-09-14T10:00:00Z",
      }),
    } as Response);

    const email = await agent.getMessage("msg_001");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/messages/msg_001",
      expect.objectContaining({ method: "GET" })
    );
    expect(email.subject).toBe("Contract Signed");
    expect(email.text).toBe("Please find attached the signed contract.");
  });

  it("replyEmail() sends POST to reply endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message_id: "msg_reply_002",
        mailbox_address: "sales-bot@wireboxmail.com",
        status: "queued",
        created_at: "2026-09-14T12:05:00Z",
      }),
    } as Response);

    const result = await agent.replyEmail("msg_001", {
      text: "Received with thanks!",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/messages/msg_001/reply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Received with thanks!" }),
      })
    );
    expect(result.message_id).toBe("msg_reply_002");
  });

  it("deleteMessage() sends DELETE request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ deleted: true, message_id: "msg_001" }),
    } as Response);

    const result = await agent.deleteMessage("msg_001");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/messages/msg_001",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.deleted).toBe(true);
  });
});
