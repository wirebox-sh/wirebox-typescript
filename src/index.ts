/**
 * Wirebox TypeScript SDK
 *
 * Official TypeScript SDK for Wirebox — Real-world identity and communication layer for AI agents.
 *
 * @packageDocumentation
 */

export { Wirebox } from "./client.js";
export { AgentIdentity } from "./identity.js";
export { ImessageClient } from "./imessage.js";
export { PhoneClient, PhoneNumbersClient, PhoneMessagesClient } from "./phone.js";
export { TunnelsClient } from "./tunnels.js";
export { WebhooksClient } from "./webhooks.js";
export { verifyWebhook } from "./verify_webhook.js";
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
  WebhookEventType,
  WebhookStatus,
  Webhook,
  WebhookCreateResult,
  CreateWebhookParams,
  UpdateWebhookParams,
  ListWebhooksParams,
  WebhookTestResult,
  WebhookRotateSecretResult,
  VerifyWebhookOptions,
  ImessageRouterInfo,
  GetImessageRouterParams,
  ImessageConversationLastMessage,
  ImessageConversation,
  ListImessageConversationsParams,
  ListImessageConversationsResult,
  DisconnectImessageConversationResult,
  ImessageMessage,
  ListImessageMessagesParams,
  ListImessageMessagesResult,
  SendImessageParams,
  SendImessageResult,
  PhoneNumberCapabilities,
  PhoneNumber,
  ProvisionPhoneNumberParams,
  ListPhoneNumbersParams,
  ListPhoneNumbersResult,
  PhoneMediaItem,
  PhoneMessage,
  ListPhoneMessagesParams,
  ListPhoneMessagesResult,
  UpdatePhoneMessageParams,
} from "./types.js";
