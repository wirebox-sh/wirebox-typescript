/**
 * Wirebox TypeScript SDK - Identity-Scoped A2A Client
 *
 * Exposes ergonomic A2A methods bound to a specific agent identity (e.g. `agent.a2a.*`).
 */

import type { HttpTransport } from "../http.js";
import { A2AClient } from "./client.js";
import { TaskHandle } from "./task_handle.js";
import type {
  A2ACallOptions,
  A2ACard,
  A2AReplyOptions,
  A2ASettings,
  A2ASkill,
  A2ATask,
  A2ATaskListOptions,
} from "./types.js";

export interface A2AIdentityClientOptions {
  handle: string;
  identityId: string;
  http: HttpTransport;
  client?: A2AClient;
}

export class A2AIdentityClient {
  readonly handle: string;
  readonly identityId: string;
  readonly client: A2AClient;
  private readonly http: HttpTransport;

  constructor(options: A2AIdentityClientOptions) {
    this.handle = options.handle;
    this.identityId = options.identityId;
    this.http = options.http;
    this.client =
      options.client ||
      new A2AClient(
        this.http.currentApiKey,
        this.http.currentBaseUrl
      );
  }

  /**
   * Send a task to a remote A2A agent (by handle or card URL) and return an observable TaskHandle.
   *
   * @example
   * ```ts
   * const task = await eva.a2a.call("auditor", { text: "Review repository PR #42" });
   * for await (const update of task.watch()) {
   *   console.log(update.state, update.message);
   * }
   * ```
   */
  async call(targetUrlOrHandle: string, options: A2ACallOptions): Promise<TaskHandle> {
    let cardUrl: string;

    if (targetUrlOrHandle.startsWith("http://") || targetUrlOrHandle.startsWith("https://")) {
      cardUrl = targetUrlOrHandle.endsWith("/card") || targetUrlOrHandle.endsWith(".json")
        ? targetUrlOrHandle
        : `${targetUrlOrHandle.replace(/\/+$/, "")}/card`;
    } else {
      const cleanHandle = targetUrlOrHandle.replace(/^@/, "").trim().toLowerCase();
      cardUrl = `${this.http.currentBaseUrl}/a2a/${cleanHandle}/card`;
    }

    const target = await this.client.fetchCard(cardUrl, {
      credential: options.credential,
      requestTimeoutMs: options.timeoutMs,
    });

    const initialTask = await this.client.send(target, options);
    return new TaskHandle(this.client, target, initialTask);
  }

  /**
   * Task inbox operations and semantic status transitions.
   */
  readonly tasks = {
    /**
     * List tasks assigned to this identity or created by this identity.
     */
    list: async (options: A2ATaskListOptions = {}): Promise<A2ATask[]> => {
      const query: Record<string, string | number | undefined> = {};
      if (options.role === "requester") {
        query.requester_handle = this.handle;
      } else {
        query.agent_handle = this.handle;
      }
      if (options.state) query.state = options.state;
      if (options.contextId) query.context_id = options.contextId;
      if (options.limit) query.limit = options.limit;

      const res = await this.http.get<{ tasks: A2ATask[]; count: number }>("/api/v1/a2a/tasks", query);
      return res.tasks || [];
    },

    /**
     * Iterate tasks page-by-page as an Async Generator.
     */
    iter: async function* (
      this: A2AIdentityClient,
      options: A2ATaskListOptions = {}
    ): AsyncIterableIterator<A2ATask> {
      const tasks = await this.tasks.list(options);
      for (const t of tasks) {
        yield t;
      }
    }.bind(this),

    /**
     * Retrieve a specific task by ID.
     */
    get: async (taskId: string): Promise<A2ATask> => {
      const res = await this.http.get<{ task: A2ATask }>(`/api/v1/a2a/tasks/${taskId}`);
      return res.task;
    },

    /**
     * Reply to a task using a semantic intent (`progress`, `complete`, `ask_caller`, or `fail`).
     */
    reply: async (taskId: string, replyOptions: A2AReplyOptions): Promise<A2ATask> => {
      const res = await this.http.post<{ task: A2ATask }>(
        `/api/v1/a2a/tasks/${taskId}/reply`,
        replyOptions
      );
      return res.task;
    },

    /**
     * Helper: Report in-progress milestone and keep task in `working` state.
     */
    progress: async (
      taskId: string,
      text: string,
      extra?: Omit<A2AReplyOptions, "intent" | "text">
    ): Promise<A2ATask> => {
      return this.tasks.reply(taskId, { intent: "progress", text, ...extra });
    },

    /**
     * Helper: Complete task successfully with message and optional deliverables.
     */
    complete: async (
      taskId: string,
      text: string,
      extra?: Omit<A2AReplyOptions, "intent" | "text">
    ): Promise<A2ATask> => {
      return this.tasks.reply(taskId, { intent: "complete", text, ...extra });
    },

    /**
     * Helper: Request caller input and place task into `input-required` state.
     */
    ask: async (
      taskId: string,
      text: string,
      extra?: Omit<A2AReplyOptions, "intent" | "text">
    ): Promise<A2ATask> => {
      return this.tasks.reply(taskId, { intent: "ask_caller", text, ...extra });
    },

    /**
     * Helper: Fail task with error explanation and place task into `failed` state.
     */
    fail: async (
      taskId: string,
      text: string,
      extra?: Omit<A2AReplyOptions, "intent" | "text">
    ): Promise<A2ATask> => {
      return this.tasks.reply(taskId, { intent: "fail", text, ...extra });
    },

    /**
     * Cancel an active task.
     */
    cancel: async (taskId: string, reason?: string): Promise<A2ATask> => {
      const res = await this.http.patch<{ task: A2ATask }>(`/api/v1/a2a/tasks/${taskId}`, {
        state: "canceled",
        status_message: reason || "Task canceled by requester.",
      });
      return res.task;
    },
  };

  /**
   * Agent Card operations.
   */
  readonly card = {
    /**
     * Retrieve this identity's public Agent Card.
     */
    get: async (): Promise<A2ACard> => {
      const res = await this.http.get<{ card: A2ACard }>(
        `/api/v1/identities/${this.handle}/a2a/card`
      );
      return res.card;
    },
  };

  /**
   * Settings and capabilities operations.
   */
  readonly settings = {
    /**
     * Get identity A2A configuration.
     */
    get: async (): Promise<A2ASettings> => {
      const res = await this.http.get<{ a2a: A2ASettings }>(
        `/api/v1/identities/${this.handle}/a2a/settings`
      );
      return res.a2a;
    },

    /**
     * Update identity A2A configuration.
     */
    update: async (changes: Partial<A2ASettings>): Promise<A2ASettings> => {
      const res = await this.http.patch<{ a2a: A2ASettings }>(
        `/api/v1/identities/${this.handle}/a2a/settings`,
        changes
      );
      return res.a2a;
    },

    /**
     * Set advertised skills on the Agent Card.
     */
    setSkills: async (skills: A2ASkill[]): Promise<A2ASettings> => {
      return this.settings.update({ a2a_skills: skills });
    },

    /**
     * Enable A2A receiver.
     */
    enable: async (): Promise<A2ASettings> => {
      return this.settings.update({ a2a_enabled: true });
    },

    /**
     * Disable A2A receiver.
     */
    disable: async (): Promise<A2ASettings> => {
      return this.settings.update({ a2a_enabled: false });
    },
  };
}
