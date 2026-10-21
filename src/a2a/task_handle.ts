/**
 * Wirebox TypeScript SDK - TaskHandle
 *
 * Provides a fluent, observable handle for interacting with an in-flight A2A task.
 */

import type { A2AClient } from "./client.js";
import type {
  A2AResolvedTarget,
  A2ATask,
  A2AWatchEvent,
  A2AWatchOptions,
} from "./types.js";

export class TaskHandle {
  readonly id: string;
  readonly contextId?: string;
  readonly target: A2AResolvedTarget;
  readonly initialTask: A2ATask;

  constructor(
    private readonly client: A2AClient,
    target: A2AResolvedTarget,
    initialTask: A2ATask
  ) {
    this.target = target;
    this.initialTask = initialTask;
    this.id = initialTask.taskId;
    this.contextId = initialTask.contextId;
  }

  /**
   * Fetch the current task snapshot from the remote agent.
   */
  async get(): Promise<A2ATask> {
    return this.client.getTask(this.target, this.id);
  }

  /**
   * Cancel this task on the remote agent.
   */
  async cancel(): Promise<A2ATask> {
    return this.client.cancel(this.target, this.id);
  }

  /**
   * Block and poll until the task reaches a terminal state (completed, failed, canceled, or input-required).
   */
  async wait(options?: A2AWatchOptions): Promise<A2ATask> {
    return this.client.wait(this.target, this.id, options);
  }

  /**
   * Stream live progress updates via an Async Iterable.
   *
   * @example
   * ```ts
   * for await (const update of task.watch()) {
   *   console.log(update.state, update.message);
   * }
   * ```
   */
  watch(options?: A2AWatchOptions): AsyncIterableIterator<A2AWatchEvent> {
    return this.client.watch(this.target, this.id, options);
  }
}
