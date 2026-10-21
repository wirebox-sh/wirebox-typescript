/**
 * Wirebox TypeScript SDK - Agent-to-Agent (A2A 1.0) Type Definitions
 */

import { WireboxError } from "../errors.js";

export class A2AProtocolError extends WireboxError {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(`A2A JSON-RPC error ${code}: ${message}`);
    this.name = "A2AProtocolError";
  }
}

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export type A2AReplyIntent = "progress" | "complete" | "ask_caller" | "fail";

export interface A2APart {
  type: string;
  text?: string;
  data?: unknown;
  mimeType?: string;
}

export interface A2AMessage {
  messageId?: string;
  role: "user" | "agent";
  parts: A2APart[];
  timestamp?: string;
}

export interface A2AArtifact {
  artifactId?: string;
  name: string;
  mimeType: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface A2ACapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  extendedAgentCard?: boolean;
}

export interface A2AInterface {
  url: string;
  protocolBinding: string;
  protocolVersion: string;
}

export interface A2ACard {
  name: string;
  description?: string;
  url?: string;
  supportedInterfaces: A2AInterface[];
  capabilities?: A2ACapabilities;
  skills?: A2ASkill[];
}

export interface A2AResolvedTarget {
  cardUrl: string;
  rpcUrl: string;
  protocolVersion: "1.0";
  card: A2ACard;
}

export interface A2ATaskStatus {
  state: A2ATaskState;
  message?: string;
  timestamp: string;
}

export interface A2ATaskRequester {
  handle?: string;
  name?: string;
  source?: string;
  [key: string]: unknown;
}

export interface A2ATask {
  kind: "task";
  taskId: string;
  contextId?: string;
  status: A2ATaskStatus;
  requester?: A2ATaskRequester;
  messages: A2AMessage[];
  artifacts: A2AArtifact[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface A2AReplyOptions {
  intent: A2AReplyIntent;
  text?: string;
  parts?: A2APart[];
  status_message?: string | null;
  artifacts?: Array<{
    artifactId?: string;
    name: string;
    mimeType?: string;
    parts: A2APart[];
    metadata?: Record<string, unknown>;
  }>;
  metadata?: Record<string, unknown>;
}

export interface A2ATaskListOptions {
  role?: "worker" | "requester";
  state?: A2ATaskState;
  contextId?: string;
  limit?: number;
}

export interface A2ACallOptions {
  text?: string;
  parts?: A2APart[];
  contextId?: string;
  taskId?: string;
  messageId?: string;
  credential?: string;
  timeoutMs?: number;
}

export interface A2AWatchOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface A2AWatchEvent {
  task: A2ATask;
  state: A2ATaskState;
  message?: string;
  isProgress: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isInputRequired: boolean;
  isCanceled: boolean;
  isTerminal: boolean;
}

export interface A2ASettings {
  a2a_enabled: boolean;
  a2a_publicly_discoverable: boolean;
  a2a_capabilities: A2ACapabilities;
  a2a_skills: A2ASkill[];
  card_url: string;
  rpc_endpoint: string;
}
