/**
 * Wirebox TypeScript SDK - Agent-to-Agent (A2A 1.0) Module
 */

export { A2AClient } from "./client.js";
export { TaskHandle } from "./task_handle.js";
export { A2AIdentityClient } from "./identity_client.js";
export {
  A2AProtocolError,
  type A2APart,
  type A2AMessage,
  type A2AArtifact,
  type A2ASkill,
  type A2ACapabilities,
  type A2AInterface,
  type A2ACard,
  type A2AResolvedTarget,
  type A2ATaskState,
  type A2ATaskStatus,
  type A2ATaskRequester,
  type A2ATask,
  type A2AReplyIntent,
  type A2AReplyOptions,
  type A2ATaskListOptions,
  type A2ACallOptions,
  type A2AWatchOptions,
  type A2AWatchEvent,
  type A2ASettings,
} from "./types.js";
