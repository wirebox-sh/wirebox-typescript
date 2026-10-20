import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wirebox } from "../src/client.js";
import { AgentIdentity } from "../src/identity.js";
import { HttpTransport } from "../src/http.js";
import { A2AClient } from "../src/a2a/client.js";
import { A2AProtocolError } from "../src/a2a/types.js";
import type { A2ACard, A2ATask, IdentityData } from "../src/types.js";

describe("A2A Protocol (Agent-to-Agent 1.0) SDK", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockCard: A2ACard = {
    name: "Auditor Agent",
    description: "Automated security code auditor",
    supportedInterfaces: [
      {
        url: "https://api.wirebox.sh/a2a/auditor",
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    skills: [
      {
        id: "security_audit",
        name: "Security Audit",
        description: "Static AST analysis",
        tags: ["security", "ast"],
      },
    ],
  };

  const mockTask: A2ATask = {
    kind: "task",
    taskId: "task_01J8TEST123456789",
    contextId: "ctx_pr_104",
    status: {
      state: "submitted",
      message: "Task received and queued in task ledger.",
      timestamp: "2026-10-20T10:00:00Z",
    },
    requester: { handle: "coordinator" },
    messages: [
      {
        messageId: "msg_01J8MSG123",
        role: "user",
        parts: [{ type: "text", text: "Please audit PR #104" }],
      },
    ],
    artifacts: [],
    metadata: {},
    createdAt: "2026-10-20T10:00:00Z",
    updatedAt: "2026-10-20T10:00:00Z",
  };

  const mockIdentityData: IdentityData = {
    id: "agt_01J8TESTIDENTITY",
    organization_id: "org_01J8TESTORG",
    agent_handle: "eva",
    display_name: "Eva",
    description: "Operations Lead",
    status: "active",
    imessage_enabled: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };

  // ==========================================================================
  // 1. Standalone A2AClient & Origin Pinning Security Tests
  // ==========================================================================
  describe("A2AClient & Origin Pinning Security", () => {
    it("pins Wirebox API key when calling a Wirebox Agent Card", async () => {
      const client = new A2AClient("wb_live_secret_key", "https://api.wirebox.sh");

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const u = url.toString();
        if (u === "https://api.wirebox.sh/a2a/auditor/card") {
          const auth = (init?.headers as Record<string, string>)?.["Authorization"];
          expect(auth).toBe("Bearer wb_live_secret_key");
          return new Response(JSON.stringify(mockCard), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${u}`);
      });

      const target = await client.fetchCard("https://api.wirebox.sh/a2a/auditor/card");
      expect(target.cardUrl).toBe("https://api.wirebox.sh/a2a/auditor/card");
      expect(target.rpcUrl).toBe("https://api.wirebox.sh/a2a/auditor");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("strips Wirebox API key when calling a 3rd-party external Agent Card", async () => {
      const client = new A2AClient("wb_live_secret_key", "https://api.wirebox.sh");

      const externalCard: A2ACard = {
        name: "External Google Agent",
        supportedInterfaces: [
          {
            url: "https://external.agent.run/rpc",
            protocolBinding: "JSONRPC",
            protocolVersion: "1.0",
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const u = url.toString();
        if (u === "https://external.agent.run/card") {
          const headers = init?.headers as Record<string, string>;
          // Wirebox API key must NOT leak to external domain
          expect(headers?.["Authorization"]).toBeUndefined();
          expect(headers?.["X-API-Key"]).toBeUndefined();
          return new Response(JSON.stringify(externalCard), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${u}`);
      });

      const target = await client.fetchCard("https://external.agent.run/card");
      expect(target.rpcUrl).toBe("https://external.agent.run/rpc");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("attaches explicit credential to external Agent Card if provided", async () => {
      const client = new A2AClient("wb_live_secret_key", "https://api.wirebox.sh");

      const externalCard: A2ACard = {
        name: "Third Party Secure Agent",
        supportedInterfaces: [
          {
            url: "https://partner.company.com/a2a/rpc",
            protocolBinding: "JSONRPC",
            protocolVersion: "1.0",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const u = url.toString();
        if (u === "https://partner.company.com/a2a/card") {
          const headers = init?.headers as Record<string, string>;
          expect(headers?.["Authorization"]).toBe("Bearer custom_partner_jwt");
          return new Response(JSON.stringify(externalCard), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${u}`);
      });

      const target = await client.fetchCard("https://partner.company.com/a2a/card", {
        credential: "custom_partner_jwt",
      });
      expect(target.rpcUrl).toBe("https://partner.company.com/a2a/rpc");
    });

    it("rejects external credentials if card origin and rpc origin mismatch", async () => {
      const client = new A2AClient("wb_live_secret_key", "https://api.wirebox.sh");

      const mismatchedCard: A2ACard = {
        name: "Phishing Agent",
        supportedInterfaces: [
          {
            url: "https://evil.hacker.com/rpc",
            protocolBinding: "JSONRPC",
            protocolVersion: "1.0",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mismatchedCard), { status: 200 })
      );

      await expect(
        client.fetchCard("https://benign.domain.com/card", { credential: "secret" })
      ).rejects.toThrow("External A2A credentials require matching Card and RPC origins.");
    });

    it("rejects Agent Card without 1.0 JSON-RPC supported interface", async () => {
      const client = new A2AClient();

      const invalidCard: A2ACard = {
        name: "Legacy Agent",
        supportedInterfaces: [
          {
            url: "https://api.wirebox.sh/grpc",
            protocolBinding: "GRPC",
            protocolVersion: "2.0",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(invalidCard), { status: 200 })
      );

      await expect(
        client.fetchCard("https://api.wirebox.sh/a2a/legacy/card")
      ).rejects.toThrow("does not advertise supported interface '1.0' with 'JSONRPC' binding.");
    });
  });

  // ==========================================================================
  // 2. Standard JSON-RPC Methods & Error Handling
  // ==========================================================================
  describe("JSON-RPC 2.0 Client Operations", () => {
    it("sends SendMessage and returns formatted task", async () => {
      const client = new A2AClient("wb_live_key", "https://api.wirebox.sh");

      const target = {
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0" as const,
        card: mockCard,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        expect(url.toString()).toBe("https://api.wirebox.sh/a2a/auditor");
        const body = JSON.parse(init?.body as string);
        expect(body.jsonrpc).toBe("2.0");
        expect(body.method).toBe("SendMessage");
        expect(body.params.message.parts[0].text).toBe("Hello auditor!");
        expect(body.params.contextId).toBe("ctx_test_1");

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: mockTask,
          }),
          { status: 200 }
        );
      });

      const task = await client.send(target, {
        text: "Hello auditor!",
        contextId: "ctx_test_1",
      });

      expect(task.taskId).toBe(mockTask.taskId);
      expect(task.status.state).toBe("submitted");
    });

    it("parses JSON-RPC protocol error into A2AProtocolError", async () => {
      const client = new A2AClient();

      const target = {
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0" as const,
        card: mockCard,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: {
              code: -32004,
              message: "Task 'task_nonexistent' not found.",
            },
          }),
          { status: 200 }
        )
      );

      await expect(client.getTask(target, "task_nonexistent")).rejects.toThrow(
        A2AProtocolError
      );
    });

    it("cancels a task via CancelTask JSON-RPC", async () => {
      const client = new A2AClient();

      const target = {
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0" as const,
        card: mockCard,
      };

      const canceledTask = {
        ...mockTask,
        status: { state: "canceled" as const, timestamp: "2026-10-20T10:05:00Z" },
        completedAt: "2026-10-20T10:05:00Z",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: canceledTask,
          }),
          { status: 200 }
        )
      );

      const res = await client.cancel(target, mockTask.taskId);
      expect(res.status.state).toBe("canceled");
    });
  });

  // ==========================================================================
  // 3. Streaming & Async Iterator (.watch() and .wait())
  // ==========================================================================
  describe("Streaming & Lifecycle Observation (.watch() / .wait())", () => {
    it("watches task progress and yields stream events until completion", async () => {
      const client = new A2AClient();

      const target = {
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0" as const,
        card: mockCard,
      };

      let callCount = 0;
      vi.spyOn(client, "getTask").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ...mockTask,
            status: { state: "working", message: "Step 1: Cloned repo", timestamp: "T1" },
          };
        } else if (callCount === 2) {
          return {
            ...mockTask,
            status: { state: "working", message: "Step 2: AST parsed", timestamp: "T2" },
          };
        } else {
          return {
            ...mockTask,
            status: { state: "completed", message: "Audit complete", timestamp: "T3" },
            completedAt: "T3",
          };
        }
      });

      const events = [];
      for await (const event of client.watch(target, mockTask.taskId, { intervalMs: 10 })) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0]?.isProgress).toBe(true);
      expect(events[0]?.message).toBe("Step 1: Cloned repo");
      expect(events[1]?.isProgress).toBe(true);
      expect(events[1]?.message).toBe("Step 2: AST parsed");
      expect(events[2]?.isCompleted).toBe(true);
      expect(events[2]?.isTerminal).toBe(true);
    });

    it("waits until task reaches terminal state", async () => {
      const client = new A2AClient();

      const target = {
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0" as const,
        card: mockCard,
      };

      let count = 0;
      vi.spyOn(client, "getTask").mockImplementation(async () => {
        count++;
        if (count < 2) {
          return { ...mockTask, status: { state: "working", timestamp: "T1" } };
        }
        return {
          ...mockTask,
          status: { state: "completed", timestamp: "T2" },
          completedAt: "T2",
        };
      });

      const completed = await client.wait(target, mockTask.taskId, { intervalMs: 10 });
      expect(completed.status.state).toBe("completed");
    });
  });

  // ==========================================================================
  // 4. Identity-Scoped A2A Client (agent.a2a.*)
  // ==========================================================================
  describe("AgentIdentity.a2a Scoped Interface", () => {
    it("calls remote agent by handle, auto-resolving card and returning TaskHandle", async () => {
      const http = new HttpTransport({
        baseUrl: "https://api.wirebox.sh",
        apiKey: "wb_live_testkey",
      });
      const agent = new AgentIdentity(mockIdentityData, http);

      vi.spyOn(agent.a2a.client, "fetchCard").mockResolvedValue({
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0",
        card: mockCard,
      });

      vi.spyOn(agent.a2a.client, "send").mockResolvedValue(mockTask);

      // Invoke one-liner call
      const taskHandle = await agent.a2a.call("auditor", {
        text: "Please audit PR #104",
        contextId: "ctx_pr_104",
      });

      expect(agent.a2a.client.fetchCard).toHaveBeenCalledWith(
        "https://api.wirebox.sh/a2a/auditor/card",
        { credential: undefined, requestTimeoutMs: undefined }
      );
      expect(taskHandle.id).toBe(mockTask.taskId);
      expect(taskHandle.contextId).toBe("ctx_pr_104");
    });

    it("supports waiting for task completion via task.wait()", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh" });
      const agent = new AgentIdentity(mockIdentityData, http);

      vi.spyOn(agent.a2a.client, "fetchCard").mockResolvedValue({
        cardUrl: "https://api.wirebox.sh/a2a/auditor/card",
        rpcUrl: "https://api.wirebox.sh/a2a/auditor",
        protocolVersion: "1.0",
        card: mockCard,
      });

      const completedTask = {
        ...mockTask,
        status: { state: "completed" as const, timestamp: "2026-10-20T10:02:00Z" },
        completedAt: "2026-10-20T10:02:00Z",
      };

      vi.spyOn(agent.a2a.client, "send").mockResolvedValue(mockTask);
      vi.spyOn(agent.a2a.client, "wait").mockResolvedValue(completedTask);

      const task = await agent.a2a.call("auditor", { text: "Audit code" });
      const finalResult = await task.wait();

      expect(finalResult.status.state).toBe("completed");
    });

    it("lists worker tasks with unified role filter", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh" });
      const agent = new AgentIdentity(mockIdentityData, http);

      const getSpy = vi.spyOn(http, "get").mockResolvedValue({
        tasks: [mockTask],
        count: 1,
      });

      const tasks = await agent.a2a.tasks.list({ role: "worker", state: "submitted" });

      expect(getSpy).toHaveBeenCalledWith("/api/v1/a2a/tasks", {
        agent_handle: "eva",
        state: "submitted",
      });
      expect(tasks).toHaveLength(1);
    });

    it("replies to task with semantic progress/complete/ask/fail helpers", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh" });
      const agent = new AgentIdentity(mockIdentityData, http);

      const postSpy = vi.spyOn(http, "post").mockImplementation(async (path, body: any) => {
        return {
          task: {
            ...mockTask,
            status: {
              state: body.intent === "complete" ? "completed" : "working",
              message: body.text,
              timestamp: "2026-10-20T10:01:00Z",
            },
          },
        };
      });

      // 1. Progress
      const p = await agent.a2a.tasks.progress("task_123", "Step 1 complete");
      expect(postSpy).toHaveBeenCalledWith("/api/v1/a2a/tasks/task_123/reply", {
        intent: "progress",
        text: "Step 1 complete",
      });
      expect(p.status.state).toBe("working");

      // 2. Complete
      const c = await agent.a2a.tasks.complete("task_123", "Finished successfully");
      expect(postSpy).toHaveBeenCalledWith("/api/v1/a2a/tasks/task_123/reply", {
        intent: "complete",
        text: "Finished successfully",
      });
      expect(c.status.state).toBe("completed");

      // 3. Ask
      await agent.a2a.tasks.ask("task_123", "Need clarification");
      expect(postSpy).toHaveBeenCalledWith("/api/v1/a2a/tasks/task_123/reply", {
        intent: "ask_caller",
        text: "Need clarification",
      });

      // 4. Fail
      await agent.a2a.tasks.fail("task_123", "Error in runtime");
      expect(postSpy).toHaveBeenCalledWith("/api/v1/a2a/tasks/task_123/reply", {
        intent: "fail",
        text: "Error in runtime",
      });
    });

    it("manages A2A settings and card", async () => {
      const http = new HttpTransport({ baseUrl: "https://api.wirebox.sh" });
      const agent = new AgentIdentity(mockIdentityData, http);

      const patchSpy = vi.spyOn(http, "patch").mockResolvedValue({
        a2a: {
          a2a_enabled: true,
          a2a_skills: [{ id: "test", name: "Test Skill", description: "Desc", tags: [] }],
        },
      });

      await agent.a2a.settings.enable();
      expect(patchSpy).toHaveBeenCalledWith("/api/v1/identities/eva/a2a/settings", {
        a2a_enabled: true,
      });

      await agent.a2a.settings.setSkills([
        { id: "test", name: "Test Skill", description: "Desc", tags: [] },
      ]);
      expect(patchSpy).toHaveBeenCalledWith("/api/v1/identities/eva/a2a/settings", {
        a2a_skills: [{ id: "test", name: "Test Skill", description: "Desc", tags: [] }],
      });
    });
  });

  // ==========================================================================
  // 5. Wirebox Top-Level Client Mount
  // ==========================================================================
  describe("Wirebox Client Top-Level A2A Mount", () => {
    it("instantiates top-level wirebox.a2a client", () => {
      const wirebox = new Wirebox({ apiKey: "wb_live_root_key" });
      expect(wirebox.a2a).toBeInstanceOf(A2AClient);
    });
  });
});
