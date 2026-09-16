/**
 * Wirebox TypeScript SDK
 *
 * Official TypeScript SDK for Wirebox — Real-world identity and communication layer for AI agents.
 *
 * @packageDocumentation
 */

export { Wirebox } from "./client.js";
export { AgentIdentity } from "./identity.js";
export { TunnelsClient } from "./tunnels.js";
export { resolveApiKey } from "./credentials.js";

// Errors
export {
  WireboxError,
  WireboxConnectionError,
  WireboxAPIError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  AgentNotFoundError,
  MailboxNotFoundError,
  ValidationError,
  HandleAlreadyTakenError,
  AlreadyVerifiedError,
  RateLimitError,
  FreeTierLimitExceededError,
  InvalidVerificationCodeError,
  VerificationCodeExpiredError,
  parseApiError,
} from "./errors.js";

// Types
export type {
  ClientOptions,
  RequestOptions,
  CreateIdentityParams,
  UpdateIdentityParams,
  IdentityMailboxSummary,
  IdentityTunnelSummary,
  IdentityData,
  ListIdentitiesParams,
  ListIdentitiesResult,
  Tunnel,
  TunnelClientInfo,
  ListTunnelsParams,
  UpdateTunnelParams,
  TunnelRequestEvent,
  TunnelConnectOptions,
  TunnelSession,
  SendEmailAttachment,
  MessageAttachmentSummary,
  SendEmailParams,
  SendEmailResult,
  ListMessagesParams,
  MessageSummary,
  ListMessagesResult,
  IterMessagesParams,
  EmailMessage,
  ReplyEmailParams,
  DeleteMessageResult,
  AgentSignupParams,
  AgentSignupResult,
  AgentVerifySignupParams,
  AgentVerifySignupResult,
  WhoamiOrganization,
  WhoamiAuth,
  WhoamiUsage,
  WhoamiResult,
} from "./types.js";
