/**
 * Wirebox TypeScript SDK - Standalone A2A 1.0 JSON-RPC Client
 *
 * Implements standard A2A 1.0 client communication with strict Origin Pinning
 * to prevent token leaks to third-party endpoints.
 */

import { WireboxConnectionError, WireboxError } from "../errors.js";
import {
  A2AProtocolError,
  type A2ACallOptions,
  type A2ACard,
  type A2AResolvedTarget,
  type A2ATask,
  type A2ATaskState,
  type A2AWatchEvent,
  type A2AWatchOptions,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const TERMINAL_STATES = new Set<A2ATaskState>([
  "completed",
  "failed",
  "canceled",
  "input-required",
]);

function canonicalUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.hash) {
    throw new TypeError("A2A URLs cannot contain credentials or fragments.");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new TypeError("A2A URLs must use HTTPS (HTTP is only permitted for localhost).");
  }
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

function getOrigin(urlStr: string): string {
  return new URL(canonicalUrl(urlStr)).origin;
}

export class A2AClient {
  private nextId = 0;
  private readonly platformOrigin: string;
  private readonly requestTimeoutMs: number;
  private readonly targetCredentials = new WeakMap<A2AResolvedTarget, string>();

  constructor(
    private readonly apiKey?: string,
    platformBaseUrl: string = "https://api.wirebox.sh",
    options: { requestTimeoutMs?: number } = {}
  ) {
    this.platformOrigin = getOrigin(platformBaseUrl);
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch and validate an Agent Card with strict Origin Pinning.
   */
  async fetchCard(
    cardUrl: string,
    options: { credential?: string; requestTimeoutMs?: number } = {}
  ): Promise<A2AResolvedTarget> {
    const canonicalCardUrl = canonicalUrl(cardUrl);
    const cardOrigin = getOrigin(canonicalCardUrl);

    const timeoutMs = options.requestTimeoutMs ?? this.requestTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let card: A2ACard;
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      // Auto-pin Wirebox API key ONLY if the target card resides on the Wirebox platform
      if (this.apiKey && cardOrigin === this.platformOrigin) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      } else if (options.credential && cardOrigin !== this.platformOrigin) {
        headers["Authorization"] = `Bearer ${options.credential}`;
      }

      const res = await fetch(canonicalCardUrl, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        throw new WireboxError("A2A Agent Card redirects are refused for security.");
      }

      if (!res.ok) {
        throw new WireboxError(`Failed to fetch Agent Card from ${cardUrl}: HTTP ${res.status}`);
      }

      card = (await res.json()) as A2ACard;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new WireboxConnectionError(`Agent Card request timed out after ${timeoutMs}ms`, err);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Resolve JSON-RPC 1.0 Interface
    const selected = card.supportedInterfaces?.find(
      (item) =>
        item.protocolVersion === "1.0" && item.protocolBinding.toUpperCase() === "JSONRPC"
    );

    if (!selected) {
      throw new WireboxError(
        `Agent Card at '${cardUrl}' does not advertise supported interface '1.0' with 'JSONRPC' binding.`
      );
    }

    const rpcUrl = canonicalUrl(selected.url);
    const rpcOrigin = getOrigin(rpcUrl);

    let credential = options.credential;

    // Safety checks for credential handling:
    if (credential !== undefined && rpcOrigin !== cardOrigin) {
      throw new TypeError("External A2A credentials require matching Card and RPC origins.");
    }

    if (cardOrigin === this.platformOrigin) {
      if (rpcOrigin !== this.platformOrigin) {
        throw new TypeError("Wirebox Agent Card points to a non-Wirebox RPC origin.");
      }
      if (this.apiKey) {
        credential = this.apiKey;
      }
    }

    const target: A2AResolvedTarget = Object.freeze({
      cardUrl: canonicalCardUrl,
      rpcUrl,
      protocolVersion: "1.0",
      card,
    });

    if (credential !== undefined) {
      this.targetCredentials.set(target, credential);
    }

    return target;
  }

  /**
   * Send a task or message to a resolved A2A target using JSON-RPC 2.0 SendMessage.
   */
  async send(target: A2AResolvedTarget, options: A2ACallOptions): Promise<A2ATask> {
    if (!options.text && (!options.parts || options.parts.length === 0)) {
      throw new TypeError("A2A call requires either 'text' or non-empty 'parts'.");
    }

    const parts =
      options.parts && options.parts.length > 0
        ? options.parts
        : [{ type: "text", text: options.text! }];

    const message: Record<string, unknown> = {
      messageId: options.messageId || `msg_${Math.random().toString(36).slice(2)}`,
      role: "user",
      parts,
    };

    const params: Record<string, unknown> = { message };
    if (options.contextId) params.contextId = options.contextId;
    if (options.taskId) params.taskId = options.taskId;

    const res = await this.rpc<any>(target, "SendMessage", params, options.timeoutMs);

    if (res && typeof res === "object") {
      if (res.kind === "task") return res as A2ATask;
      if (res.task && typeof res.task === "object") return res.task as A2ATask;
      if ("taskId" in res && "status" in res) return res as A2ATask;
    }

    throw new WireboxError("Invalid SendMessage response payload from remote agent.");
  }

  /**
   * Retrieve task details and status from an A2A target.
   */
  async getTask(
    target: A2AResolvedTarget,
    taskId: string,
    options: { timeoutMs?: number } = {}
  ): Promise<A2ATask> {
    const res = await this.rpc<any>(
      target,
      "GetTask",
      { taskId, id: taskId },
      options.timeoutMs
    );

    if (res && typeof res === "object") {
      if (res.kind === "task") return res as A2ATask;
      if (res.task && typeof res.task === "object") return res.task as A2ATask;
      if ("taskId" in res && "status" in res) return res as A2ATask;
    }

    throw new WireboxError(`Invalid GetTask response payload for taskId '${taskId}'.`);
  }

  /**
   * List tasks for a given context or status.
   */
  async listTasks(
    target: A2AResolvedTarget,
    options: { contextId?: string; state?: string; limit?: number; timeoutMs?: number } = {}
  ): Promise<{ tasks: A2ATask[]; count: number }> {
    const params: Record<string, unknown> = {};
    if (options.contextId) params.contextId = options.contextId;
    if (options.state) params.state = options.state;
    if (options.limit) params.limit = options.limit;

    const res = await this.rpc<any>(target, "ListTasks", params, options.timeoutMs);
    const tasks = Array.isArray(res?.tasks) ? (res.tasks as A2ATask[]) : [];
    return { tasks, count: tasks.length };
  }

  /**
   * Cancel a remote task.
   */
  async cancel(
    target: A2AResolvedTarget,
    taskId: string,
    options: { timeoutMs?: number } = {}
  ): Promise<A2ATask> {
    const res = await this.rpc<any>(
      target,
      "CancelTask",
      { taskId, id: taskId },
      options.timeoutMs
    );

    if (res && typeof res === "object") {
      if (res.kind === "task") return res as A2ATask;
      if (res.task && typeof res.task === "object") return res.task as A2ATask;
      if ("taskId" in res && "status" in res) return res as A2ATask;
    }

    throw new WireboxError(`Invalid CancelTask response payload for taskId '${taskId}'.`);
  }

  /**
   * Poll until the task stops in a terminal state (completed, failed, canceled, or input-required).
   */
  async wait(
    target: A2AResolvedTarget,
    taskId: string,
    options: A2AWatchOptions = {}
  ): Promise<A2ATask> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const intervalMs = options.intervalMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const task = await this.getTask(target, taskId, {
        timeoutMs: Math.min(this.requestTimeoutMs, deadline - Date.now()),
      });

      if (TERMINAL_STATES.has(task.status.state)) {
        return task;
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }

    throw new WireboxError(`A2A task '${taskId}' did not reach terminal state within ${timeoutMs}ms.`);
  }

  /**
   * Asynchronously watch a task, yielding an event whenever its state or message changes.
   */
  async *watch(
    target: A2AResolvedTarget,
    taskId: string,
    options: A2AWatchOptions = {}
  ): AsyncIterableIterator<A2AWatchEvent> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const intervalMs = options.intervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;

    let lastTimestamp: string | undefined;
    let lastState: A2ATaskState | undefined;

    while (Date.now() < deadline) {
      const remainingTime = deadline - Date.now();
      if (remainingTime <= 0) break;

      const task = await this.getTask(target, taskId, {
        timeoutMs: Math.min(this.requestTimeoutMs, remainingTime),
      });

      const state = task.status.state;
      const timestamp = task.status.timestamp || task.updatedAt;

      // Yield if state changed, timestamp changed, or first observation
      if (state !== lastState || timestamp !== lastTimestamp) {
        lastState = state;
        lastTimestamp = timestamp;

        const isProgress = state === "working";
        const isCompleted = state === "completed";
        const isFailed = state === "failed";
        const isInputRequired = state === "input-required";
        const isCanceled = state === "canceled";
        const isTerminal = TERMINAL_STATES.has(state);

        yield {
          task,
          state,
          message: task.status.message,
          isProgress,
          isCompleted,
          isFailed,
          isInputRequired,
          isCanceled,
          isTerminal,
        };

        if (isTerminal) {
          return;
        }
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }

    throw new WireboxError(`Task watch for '${taskId}' timed out after ${timeoutMs}ms.`);
  }

  /**
   * Perform raw JSON-RPC 2.0 call with headers and error unwrapping.
   */
  private async rpc<T>(
    target: A2AResolvedTarget,
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number = this.requestTimeoutMs
  ): Promise<T> {
    const rpcUrl = target.rpcUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "A2A-Version": "1.0",
      "User-Agent": "@wirebox-sh/sdk/0.7.1",
    };

    const credential = this.targetCredentials.get(target);
    if (credential) {
      headers["Authorization"] = `Bearer ${credential}`;
      headers["X-API-Key"] = credential;
    }

    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers,
        redirect: "manual",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.nextId,
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        throw new WireboxError("A2A RPC redirects are refused for security.");
      }

      if (!res.ok) {
        throw new WireboxError(`A2A RPC request failed with HTTP ${res.status}`);
      }

      const payload = (await res.json()) as {
        result?: T;
        error?: { code?: number; message?: string; data?: unknown };
      };

      if (payload.error) {
        throw new A2AProtocolError(
          payload.error.code ?? -32603,
          payload.error.message ?? "Unknown A2A protocol error.",
          payload.error.data
        );
      }

      return payload.result as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new WireboxConnectionError(`A2A RPC request timed out after ${timeoutMs}ms`, err);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
