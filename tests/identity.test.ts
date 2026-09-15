import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpTransport } from "../src/http.js";
import { AgentIdentity } from "../src/identity.js";
import type { IdentityData } from "../src/types.js";

describe("AgentIdentity Domain Object", () => {
  const sampleData: IdentityData = {
    id: "agt_01j9876543210fedcba",
    organization_id: "org_01j1234567890abcdef",
    agent_handle: "sales-bot",
    display_name: "Sales Assistant",
    description: "Automates sales inquiries",
    status: "active",
    created_at: "2026-09-14T10:00:00Z",
    updated_at: "2026-09-14T10:00:00Z",
    mailboxes: [
      {
        id: "mbx_01j111222333444555",
        email_address: "sales-bot@wireboxmail.com",
        created_at: "2026-09-14T10:00:00Z",
      },
    ],
  };

  let transport: HttpTransport;

  beforeEach(() => {
    transport = new HttpTransport({
      baseUrl: "https://api.wirebox.sh",
      apiKey: "wb_live_test_123",
    });
    vi.restoreAllMocks();
  });

  it("instantiates correctly with snapshot fields", () => {
    const identity = new AgentIdentity(sampleData, transport);
    expect(identity.id).toBe("agt_01j9876543210fedcba");
    expect(identity.agent_handle).toBe("sales-bot");
    expect(identity.display_name).toBe("Sales Assistant");
    expect(identity.mailbox.email_address).toBe("sales-bot@wireboxmail.com");
  });

  it("update() sends PATCH request and returns a fresh AgentIdentity", async () => {
    const updatedData: IdentityData = {
      ...sampleData,
      display_name: "Senior Sales Assistant",
      updated_at: "2026-09-14T11:00:00Z",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => updatedData,
    } as Response);

    const identity = new AgentIdentity(sampleData, transport);
    const updated = await identity.update({ display_name: "Senior Sales Assistant" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/identities/sales-bot",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ display_name: "Senior Sales Assistant" }),
      })
    );
    expect(updated.display_name).toBe("Senior Sales Assistant");
    expect(updated).not.toBe(identity); // Immutable snapshot contract
  });

  it("delete() sends DELETE request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as Response);

    const identity = new AgentIdentity(sampleData, transport);
    await identity.delete();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/identities/sales-bot",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
