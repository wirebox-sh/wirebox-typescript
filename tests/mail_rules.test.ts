import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AgentIdentity } from "../src/identity.js";
import { HttpTransport } from "../src/http.js";
import type { MailRule } from "../src/types.js";

describe("Mail Rules & Guardrails Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRule: MailRule = {
    id: "mrl_01J8ABC123DEF456",
    agent_handle: "sales-bot",
    direction: "both",
    action: "allow",
    entry: "alice@company.com",
    match_type: "exact_email",
    match_target: "alice@company.com",
    reason: "Key account contact",
    status: "active",
    created_at: "2026-10-05T12:00:00Z",
    updated_at: "2026-10-05T12:00:00Z",
  };

  it("lists mail rules for an agent handle and strips leading @", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const getSpy = vi.spyOn((client as any)._http, "get").mockResolvedValue({
      rules: [mockRule],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const result = await client.mailRules.list("@sales-bot", {
      direction: "inbound",
      action: "allow",
      limit: 10,
    });

    expect(getSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules",
      { direction: "inbound", action: "allow", limit: 10, offset: undefined },
      undefined
    );
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.entry).toBe("alice@company.com");
  });

  it("retrieves a single mail rule by ID", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const getSpy = vi.spyOn((client as any)._http, "get").mockResolvedValue(mockRule);

    const rule = await client.mailRules.get("sales-bot", "mrl_01J8ABC123DEF456");

    expect(getSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules/mrl_01J8ABC123DEF456",
      undefined,
      undefined
    );
    expect(rule.id).toBe("mrl_01J8ABC123DEF456");
  });

  it("creates a mail rule with full parameters", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const postSpy = vi.spyOn((client as any)._http, "post").mockResolvedValue(mockRule);

    const rule = await client.mailRules.create("@sales-bot", {
      entry: "alice@company.com",
      direction: "inbound",
      action: "allow",
      reason: "VIP Lead",
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules",
      {
        entry: "alice@company.com",
        direction: "inbound",
        action: "allow",
        reason: "VIP Lead",
      },
      undefined
    );
    expect(rule.action).toBe("allow");
  });

  it("supports ergonomic allow() helper", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const postSpy = vi.spyOn((client as any)._http, "post").mockResolvedValue(mockRule);

    await client.mailRules.allow("sales-bot", "@partner.org", {
      direction: "inbound",
      reason: "Trusted partner domain",
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules",
      {
        entry: "@partner.org",
        direction: "inbound",
        action: "allow",
        reason: "Trusted partner domain",
      },
      undefined
    );
  });

  it("supports ergonomic block() helper", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const blockRule = { ...mockRule, action: "block" as const, entry: "spammer@evil.com" };
    const postSpy = vi.spyOn((client as any)._http, "post").mockResolvedValue(blockRule);

    await client.mailRules.block("sales-bot", "spammer@evil.com", {
      reason: "Phishing attempt",
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules",
      {
        entry: "spammer@evil.com",
        direction: "both",
        action: "block",
        reason: "Phishing attempt",
      },
      undefined
    );
  });

  it("updates an existing mail rule", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const updatedRule = { ...mockRule, status: "paused" as const };
    const patchSpy = vi.spyOn((client as any)._http, "patch").mockResolvedValue(updatedRule);

    const res = await client.mailRules.update("sales-bot", "mrl_01J8ABC123DEF456", {
      status: "paused",
      reason: "Temporarily disabled",
    });

    expect(patchSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules/mrl_01J8ABC123DEF456",
      { status: "paused", reason: "Temporarily disabled" },
      undefined
    );
    expect(res.status).toBe("paused");
  });

  it("deletes a mail rule by ID", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const deleteSpy = vi.spyOn((client as any)._http, "delete").mockResolvedValue({
      deleted: true,
      id: "mrl_01J8ABC123DEF456",
    });

    const res = await client.mailRules.delete("sales-bot", "mrl_01J8ABC123DEF456");

    expect(deleteSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot/mail-rules/mrl_01J8ABC123DEF456",
      undefined
    );
    expect(res.deleted).toBe(true);
    expect(res.id).toBe("mrl_01J8ABC123DEF456");
  });

  it("retrieves and updates policy via client.mailRules.getPolicy() and setPolicy()", async () => {
    const client = new Wirebox({ apiKey: "wb_live_testkey" });
    const getSpy = vi.spyOn((client as any)._http, "get").mockResolvedValue({
      mail_inbound_filter_mode: "whitelist",
      mail_outbound_filter_mode: "blacklist",
    });

    const policy = await client.mailRules.getPolicy("@sales-bot");
    expect(getSpy).toHaveBeenCalledWith("/v1/identities/sales-bot", undefined, undefined);
    expect(policy.inbound).toBe("protected");
    expect(policy.outbound).toBe("open");

    const patchSpy = vi.spyOn((client as any)._http, "patch").mockResolvedValue({
      mail_inbound_filter_mode: "whitelist",
      mail_outbound_filter_mode: "whitelist",
    });

    const updated = await client.mailRules.setPolicy("sales-bot", {
      inbound: "protected",
      outbound: "restricted",
    });

    expect(patchSpy).toHaveBeenCalledWith(
      "/v1/identities/sales-bot",
      {
        mail_inbound_filter_mode: "whitelist",
        mail_outbound_filter_mode: "whitelist",
      },
      undefined
    );
    expect(updated.inbound).toBe("protected");
    expect(updated.outbound).toBe("restricted");
  });

  describe("AgentIdentity Fluent mailRules Integration", () => {
    const mockIdentityData = {
      id: "agt_01J8ABC123456789",
      organization_id: "org_01J8ABC",
      agent_handle: "sales-bot",
      display_name: "Sales Agent",
      description: "Automated sales representative",
      status: "active" as const,
      mail_inbound_filter_mode: "whitelist" as const,
      mail_outbound_filter_mode: "blacklist" as const,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    };

    it("exposes mailRules and security posture on AgentIdentity instance", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_test" });
      const agent = new AgentIdentity(mockIdentityData, http);

      expect(agent.mail_inbound_filter_mode).toBe("whitelist");
      expect(agent.mail_outbound_filter_mode).toBe("blacklist");
      expect(agent.mailPolicy.inbound).toBe("protected");
      expect(agent.mailPolicy.outbound).toBe("open");
      expect(agent.mailRules).toBeDefined();

      const postSpy = vi.spyOn(http, "post").mockResolvedValue(mockRule);
      await agent.mailRules.allow("boss@company.com", { reason: "Executive" });

      expect(postSpy).toHaveBeenCalledWith(
        "/v1/identities/sales-bot/mail-rules",
        {
          entry: "boss@company.com",
          direction: "both",
          action: "allow",
          reason: "Executive",
        },
        undefined
      );
    });

    it("allows updating security posture via setMailPolicy()", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_test" });
      const agent = new AgentIdentity(mockIdentityData, http);

      const patchSpy = vi.spyOn(http, "patch").mockResolvedValue({
        ...mockIdentityData,
        mail_inbound_filter_mode: "whitelist",
        mail_outbound_filter_mode: "whitelist",
      });

      const updated = await agent.setMailPolicy({
        inbound: "protected",
        outbound: "restricted",
      });

      expect(patchSpy).toHaveBeenCalledWith(
        "/v1/identities/sales-bot",
        {
          mail_inbound_filter_mode: "whitelist",
          mail_outbound_filter_mode: "whitelist",
        },
        undefined
      );
      expect(updated.mailPolicy.inbound).toBe("protected");
      expect(updated.mailPolicy.outbound).toBe("restricted");
    });

    it("supports policy inspection and update directly via agent.mailRules", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh", apiKey: "wb_live_test" });
      const agent = new AgentIdentity(mockIdentityData, http);

      vi.spyOn(http, "get").mockResolvedValue({
        mail_inbound_filter_mode: "whitelist",
        mail_outbound_filter_mode: "blacklist",
      });
      const policy = await agent.mailRules.getPolicy();
      expect(policy.inbound).toBe("protected");
      expect(policy.outbound).toBe("open");

      const patchSpy = vi.spyOn(http, "patch").mockResolvedValue({
        mail_inbound_filter_mode: "blacklist",
        mail_outbound_filter_mode: "blacklist",
      });
      const updated = await agent.mailRules.setPolicy({
        inbound: "open",
        outbound: "open",
      });
      expect(patchSpy).toHaveBeenCalledWith(
        "/v1/identities/sales-bot",
        {
          mail_inbound_filter_mode: "blacklist",
          mail_outbound_filter_mode: "blacklist",
        },
        undefined
      );
      expect(updated.inbound).toBe("open");
      expect(updated.outbound).toBe("open");
    });
  });
});
