import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AgentIdentity } from "../src/identity.js";
import { HttpTransport } from "../src/http.js";

describe("iMessage Client & Agent Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRouter = {
    router_number: "+16282649335",
    agent_handle: "sale-mark",
    connect_command: "connect @sale-mark",
    qr_uri: "sms:+16282649335&body=connect%20%40sale-mark",
    status: "online",
  };

  const mockConversation = {
    id: "conv_01j999888777",
    identity_id: "agt_123",
    user_phone: "+16465550123",
    status: "connected",
    unread_count: 0,
    last_message: {
      id: "msg_last1",
      direction: "inbound",
      text: "Hello",
      has_media: false,
      created_at: "2026-09-17T02:00:00Z",
    },
    created_at: "2026-09-17T01:00:00Z",
    updated_at: "2026-09-17T02:00:00Z",
  };

  const mockSentMessage = {
    id: "msg_sent001",
    conversation_id: "conv_01j999888777",
    identity_id: "agt_123",
    direction: "outbound",
    to: "+16465550123",
    text: "Hello from agent!",
    media_url: null,
    status: "sent",
    created_at: "2026-09-17T02:01:00Z",
  };

  it("wirebox.imessage.getRouter() fetches router information and formats queries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockRouter,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const router = await client.imessage.getRouter({ agent: "@sale-mark", user_phone: "+16465550123" });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.wirebox.sh/v1/imessage/router"),
      expect.objectContaining({ method: "GET" })
    );

    const calledUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(calledUrl.searchParams.get("agent")).toBe("sale-mark");
    expect(calledUrl.searchParams.get("user_phone")).toBe("+16465550123");

    expect(router.router_number).toBe("+16282649335");
    expect(router.connect_command).toBe("connect @sale-mark");
    expect(router.qr_uri).toContain("sms:+16282649335");
  });

  it("wirebox.imessage.conversations.list() fetches conversations with pagination params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [mockConversation],
        next_cursor: "cur_next",
        has_more: true,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const res = await client.imessage.conversations.list({
      identity_id: "agt_123",
      status: "connected",
      limit: 10,
      cursor: "cur_prev",
    });

    const calledUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(calledUrl.pathname).toBe("/v1/imessage/conversations");
    expect(calledUrl.searchParams.get("identity_id")).toBe("agt_123");
    expect(calledUrl.searchParams.get("status")).toBe("connected");
    expect(calledUrl.searchParams.get("limit")).toBe("10");
    expect(calledUrl.searchParams.get("cursor")).toBe("cur_prev");

    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.id).toBe("conv_01j999888777");
    expect(res.has_more).toBe(true);
    expect(res.next_cursor).toBe("cur_next");
  });

  it("wirebox.imessage.conversations.get() retrieves single conversation", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockConversation,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const conv = await client.imessage.conversations.get("conv_01j999888777");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/imessage/conversations/conv_01j999888777",
      expect.objectContaining({ method: "GET" })
    );
    expect(conv.id).toBe("conv_01j999888777");
    expect(conv.user_phone).toBe("+16465550123");
  });

  it("wirebox.imessage.conversations.disconnect() sends disconnect request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "conv_01j999888777",
        status: "disconnected",
        disconnected_at: "2026-09-17T02:30:00Z",
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const res = await client.imessage.conversations.disconnect("conv_01j999888777");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/imessage/conversations/conv_01j999888777/disconnect",
      expect.objectContaining({ method: "POST" })
    );
    expect(res.status).toBe("disconnected");
    expect(res.id).toBe("conv_01j999888777");
  });

  it("wirebox.imessage.messages.send() sends outbound iMessage", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockSentMessage,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const res = await client.imessage.messages.send({
      conversation_id: "conv_01j999888777",
      text: "Hello from agent!",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/imessage/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversation_id: "conv_01j999888777",
          text: "Hello from agent!",
        }),
      })
    );
    expect(res.id).toBe("msg_sent001");
    expect(res.status).toBe("sent");
  });

  it("wirebox.imessage.messages.list() retrieves message history with cursor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [
          {
            id: "msg_1",
            conversation_id: "conv_01j999888777",
            identity_id: "agt_123",
            direction: "inbound",
            sender: "+16465550123",
            text: "Hello",
            media_url: null,
            is_read: true,
            created_at: "2026-09-17T02:00:00Z",
          },
        ],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const res = await client.imessage.messages.list({
      conversation_id: "conv_01j999888777",
      limit: 20,
    });

    const calledUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(calledUrl.pathname).toBe("/v1/imessage/messages");
    expect(calledUrl.searchParams.get("conversation_id")).toBe("conv_01j999888777");
    expect(calledUrl.searchParams.get("limit")).toBe("20");

    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.text).toBe("Hello");
  });

  it("wirebox.imessage.users manages allowlist (list, add, remove)", async () => {
    const fetchListSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [{ phone_number: "+16465550123", assigned_router_number: "+16282649335" }],
        total: 1,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const listRes = await client.imessage.users.list();
    expect(listRes.total).toBe(1);
    expect(listRes.data[0]?.phone_number).toBe("+16465550123");

    const fetchAddSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        phone_number: "+16465559999",
        assigned_router_number: "+16282649335",
        status: "active",
      }),
    } as Response);

    const addRes = await client.imessage.users.add("+16465559999");
    expect(addRes.phone_number).toBe("+16465559999");

    const fetchDeleteSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ status: "deleted", phone_number: "+16465559999" }),
    } as Response);

    const delRes = await client.imessage.users.remove("+16465559999");
    expect(delRes.status).toBe("deleted");
    expect(delRes.phone_number).toBe("+16465559999");
  });

  it("AgentIdentity direct methods scope calls to agent identity", async () => {
    const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_test_key" });
    const agent = new AgentIdentity(
      {
        id: "agt_123",
        organization_id: "org_456",
        agent_handle: "sale-mark",
        display_name: "Sale Mark",
        description: null,
        status: "active",
        created_at: "2026-09-14T12:00:00Z",
        updated_at: "2026-09-14T12:00:00Z",
      },
      http
    );

    // 1. getImessageRouter
    const fetchSpy1 = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockRouter,
    } as Response);

    const router = await agent.getImessageRouter();
    expect(router.agent_handle).toBe("sale-mark");
    const calledUrl1 = new URL(fetchSpy1.mock.calls[0]![0] as string);
    expect(calledUrl1.searchParams.get("agent")).toBe("sale-mark");

    // 2. sendImessage
    const fetchSpy2 = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockSentMessage,
    } as Response);

    const sent = await agent.sendImessage({
      conversation_id: "conv_01j999888777",
      text: "Replying directly from agent instance",
    });
    expect(sent.status).toBe("sent");
    expect(fetchSpy2).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/imessage/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversation_id: "conv_01j999888777",
          text: "Replying directly from agent instance",
          identity_id: "agt_123",
        }),
      })
    );

    // 3. listImessageConversations
    const fetchSpy3 = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [mockConversation], next_cursor: null, has_more: false }),
    } as Response);

    const convs = await agent.listImessageConversations({ status: "connected" });
    expect(convs.data).toHaveLength(1);
    const calledUrl3 = new URL(fetchSpy3.mock.calls[0]![0] as string);
    expect(calledUrl3.searchParams.get("identity_id")).toBe("agt_123");
    expect(calledUrl3.searchParams.get("status")).toBe("connected");

    // 4. disconnectImessageConversation
    const fetchSpy4 = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "conv_01j999888777", status: "disconnected", disconnected_at: "2026-09-17T02:30:00Z" }),
    } as Response);

    const disc = await agent.disconnectImessageConversation("conv_01j999888777");
    expect(disc.status).toBe("disconnected");
  });

  it("agent.iterImessageMessages() streams auto-paginated messages across pages", async () => {
    const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_test_key" });
    const agent = new AgentIdentity(
      {
        id: "agt_123",
        organization_id: "org_456",
        agent_handle: "sale-mark",
        display_name: "Sale Mark",
        description: null,
        status: "active",
        created_at: "2026-09-14T12:00:00Z",
        updated_at: "2026-09-14T12:00:00Z",
      },
      http
    );

    // Page 1 and Page 2 mocks
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            {
              id: "msg_page1_1",
              conversation_id: "conv_01j999888777",
              identity_id: "agt_123",
              direction: "inbound",
              sender: "+16465550123",
              text: "Msg 1",
              media_url: null,
              is_read: true,
              created_at: "2026-09-17T02:00:00Z",
            },
          ],
          next_cursor: "cursor_page2",
          has_more: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            {
              id: "msg_page2_1",
              conversation_id: "conv_01j999888777",
              identity_id: "agt_123",
              direction: "outbound",
              sender: "agent",
              text: "Msg 2",
              media_url: null,
              is_read: true,
              created_at: "2026-09-17T02:01:00Z",
            },
          ],
          next_cursor: null,
          has_more: false,
        }),
      } as Response);

    const received: string[] = [];
    for await (const msg of agent.iterImessageMessages("conv_01j999888777")) {
      received.push(msg.text!);
    }

    expect(received).toEqual(["Msg 1", "Msg 2"]);
  });
});
