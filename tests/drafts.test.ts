import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpTransport } from "../src/http.js";
import { AgentIdentity } from "../src/identity.js";
import type { IdentityData } from "../src/types.js";

describe("AgentIdentity Draft Actions", () => {
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

  it("createDraft() sends POST to /v1/mailboxes/:address/drafts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "dft_001",
        mailbox_id: "mbx_123",
        to: ["lead@example.com"],
        subject: "Draft subject",
        text: "Draft content",
        status: "draft",
        version: 1,
        has_attachments: false,
        attachments: [],
        created_at: "2026-10-06T12:00:00Z",
        updated_at: "2026-10-06T12:00:00Z",
      }),
    } as Response);

    const draft = await agent.createDraft({
      to: "lead@example.com",
      subject: "Draft subject",
      text: "Draft content",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/drafts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to: "lead@example.com",
          subject: "Draft subject",
          text: "Draft content",
        }),
      })
    );
    expect(draft.id).toBe("dft_001");
    expect(draft.version).toBe(1);
  });

  it("listDrafts() sends GET to /v1/mailboxes/:address/drafts with query params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        drafts: [
          {
            id: "dft_001",
            mailbox_id: "mbx_123",
            subject: "Draft 1",
            status: "draft",
            version: 1,
          },
        ],
        count: 1,
        limit: 10,
        offset: 0,
      }),
    } as Response);

    const res = await agent.listDrafts({ limit: 10, offset: 0 });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/drafts?limit=10&offset=0",
      expect.objectContaining({ method: "GET" })
    );
    expect(res.drafts).toHaveLength(1);
    expect(res.count).toBe(1);
  });

  it("iterDrafts() auto-paginates across draft pages", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          drafts: [{ id: "dft_001", subject: "Draft 1" }],
          count: 2,
          limit: 1,
          offset: 0,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          drafts: [{ id: "dft_002", subject: "Draft 2" }],
          count: 2,
          limit: 1,
          offset: 1,
        }),
      } as Response);

    const items: string[] = [];
    for await (const d of agent.iterDrafts({ limit: 1 })) {
      items.push(d.id);
    }

    expect(items).toEqual(["dft_001", "dft_002"]);
  });

  it("getDraft() sends GET to /v1/mailboxes/:address/drafts/:id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "dft_001",
        mailbox_id: "mbx_123",
        subject: "Draft 1",
        version: 2,
      }),
    } as Response);

    const draft = await agent.getDraft("dft_001");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/drafts/dft_001",
      expect.objectContaining({ method: "GET" })
    );
    expect(draft.id).toBe("dft_001");
  });

  it("updateDraft() sends PATCH to /v1/mailboxes/:address/drafts/:id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "dft_001",
        mailbox_id: "mbx_123",
        subject: "Updated",
        version: 3,
      }),
    } as Response);

    const updated = await agent.updateDraft("dft_001", {
      version: 2,
      subject: "Updated",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/drafts/dft_001",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ version: 2, subject: "Updated" }),
      })
    );
    expect(updated.version).toBe(3);
  });

  it("deleteDraft() sends DELETE to /v1/mailboxes/:address/drafts/:id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "dft_001",
        deleted: true,
      }),
    } as Response);

    const res = await agent.deleteDraft("dft_001");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/drafts/dft_001",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(res.deleted).toBe(true);
  });

  it("sendDraft() sends POST to /v1/mailboxes/:address/drafts/:id/send with Idempotency-Key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "msg_999",
        thread_id: "thd_888",
        status: "sent",
      }),
    } as Response);

    const res = await agent.sendDraft("dft_001", {
      idempotencyKey: "send-key-001",
      overrides: { subject: "Final Send Subject" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/mailboxes/sales-bot%40wireboxmail.com/drafts/dft_001/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "send-key-001",
        }),
        body: JSON.stringify({ subject: "Final Send Subject" }),
      })
    );
    expect(res.id).toBe("msg_999");
    expect(res.status).toBe("sent");
  });
});
