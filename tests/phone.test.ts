import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AgentIdentity } from "../src/identity.js";
import { HttpTransport } from "../src/http.js";

describe("Phone Client & Agent Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockNumber = {
    id: "pn_01J8DEF123456789",
    phone_number: "+14155552671",
    country_code: "US",
    type: "local",
    region: "CA",
    agent_handle: "support-bot",
    agent_identity_id: "agt_01J8ABC123456789",
    status: "active",
    sms_status: "ready",
    sms_error_code: null,
    sms_error_detail: null,
    sms_ready_at: "2026-09-18T10:00:00Z",
    capabilities: {
      sms: true,
      mms: true,
      voice: true,
    },
    created_at: "2026-09-18T10:00:00Z",
    updated_at: "2026-09-18T10:00:00Z",
  };

  const mockMessage = {
    id: "msg_01J8SMS123456789",
    phone_number: "+14155552671",
    agent_handle: "support-bot",
    direction: "inbound",
    type: "sms",
    from_number: "+15559876543",
    to_numbers: ["+14155552671"],
    text: "Hello, can you help me with my order?",
    media: null,
    is_read: false,
    segments: 1,
    created_at: "2026-09-18T10:05:00Z",
  };

  const mockMmsMessage = {
    id: "msg_01J8MMS123456789",
    phone_number: "+14155552671",
    agent_handle: "support-bot",
    direction: "inbound",
    type: "mms",
    from_number: "+15559876543",
    to_numbers: ["+14155552671"],
    text: "Here is the screenshot",
    media: [
      {
        content_type: "image/png",
        size_bytes: 45200,
        url: "https://api.wirebox.sh/media/signed_token_123",
      },
    ],
    is_read: false,
    segments: 1,
    created_at: "2026-09-18T10:06:00Z",
  };

  it("wirebox.phone.numbers.provision() provisions a number with stripped @handle", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockNumber,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const result = await client.phone.numbers.provision({
      agent_handle: "@support-bot",
      region: "CA",
      type: "local",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          agent_handle: "support-bot",
          type: "local",
          region: "CA",
        }),
      })
    );
    expect(result.phone_number).toBe("+14155552671");
    expect(result.capabilities.sms).toBe(true);
  });

  it("wirebox.phone.numbers.list() lists phone numbers with cursor pagination", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        numbers: [mockNumber],
        next_cursor: "cur_next123",
        has_more: true,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const result = await client.phone.numbers.list({ limit: 10, status: "active" });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.wirebox.sh/v1/phone/numbers?"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result.numbers).toHaveLength(1);
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe("cur_next123");
  });

  it("wirebox.phone.numbers.get() retrieves number details by polymorphic identifier", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockNumber,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const result = await client.phone.numbers.get("@support-bot");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/support-bot",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.phone_number).toBe("+14155552671");
  });

  it("wirebox.phone.numbers.release() sends DELETE to release carrier number", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => "",
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    await client.phone.numbers.release("+14155552671");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/%2B14155552671",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("wirebox.phone.messages.list() lists messages with filters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        messages: [mockMessage, mockMmsMessage],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const result = await client.phone.messages.list("support-bot", { is_read: false });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.wirebox.sh/v1/phone/numbers/support-bot/messages?"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].media?.[0].content_type).toBe("image/png");
  });

  it("wirebox.phone.messages.get() retrieves single message details", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockMessage,
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const msg = await client.phone.messages.get("+14155552671", "msg_01J8SMS123456789");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/%2B14155552671/messages/msg_01J8SMS123456789",
      expect.objectContaining({ method: "GET" })
    );
    expect(msg.text).toBe("Hello, can you help me with my order?");
  });

  it("wirebox.phone.messages.markRead() sends PATCH with is_read: true", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ...mockMessage, is_read: true }),
    } as Response);

    const client = new Wirebox({ apiKey: "wb_live_test_key" });
    const updated = await client.phone.messages.markRead("support-bot", "msg_01J8SMS123456789");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/support-bot/messages/msg_01J8SMS123456789",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ is_read: true }),
      })
    );
    expect(updated.is_read).toBe(true);
  });

  it("AgentIdentity provides scoped phone helpers", async () => {
    const transport = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_key" });
    const agent = new AgentIdentity(
      {
        id: "agt_01J8ABC123456789",
        organization_id: "org_123",
        agent_handle: "support-bot",
        display_name: "Support Bot",
        description: "Customer service agent",
        status: "active",
        created_at: "2026-09-18T10:00:00Z",
        updated_at: "2026-09-18T10:00:00Z",
      },
      transport
    );

    // 1. Provision phone number
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockNumber,
    } as Response);

    const num = await agent.provisionPhoneNumber({ region: "CA" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ agent_handle: "support-bot", region: "CA" }),
      })
    );
    expect(num.phone_number).toBe("+14155552671");

    // 2. Get phone number
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockNumber,
    } as Response);

    const fetched = await agent.getPhoneNumber();
    expect(fetched.phone_number).toBe("+14155552671");

    // 3. Agent scoped messages list
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        messages: [mockMessage],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    const msgList = await agent.phone.listMessages({ is_read: false });
    expect(msgList.messages).toHaveLength(1);

    // 4. Agent release phone number
    const releaseSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => "",
    } as Response);

    await agent.releasePhoneNumber();
    expect(releaseSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/support-bot",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
