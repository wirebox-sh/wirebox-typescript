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
export { MailRulesClient, IdentityMailRulesClient } from "./mail_rules.js";
export type { AllowBlockOptions } from "./mail_rules.js";
export { PhoneClient, PhoneNumbersClient, PhoneMessagesClient } from "./phone.js";
export { TunnelsClient } from "./tunnels.js";
export { WebhooksClient } from "./webhooks.js";
export { verifyWebhook } from "./verify_webhook.js";
export { resolveApiKey } from "./credentials.js";

// Vault
export { VaultClient, UnlockedVault } from "./vault/client.js";
export type { VaultInitializeResult } from "./vault/client.js";
export { VaultSecretType } from "./vault/types.js";
export type {
  LoginPayload,
  ApiKeyPayload,
  OtherPayload,
  SecretPayload,
  VaultSecretSummary,
  DecryptedSecret,
  VaultInfo,
  VaultAccessGrant,
} from "./vault/types.js";
export { TOTPAlgorithm, generateTotp, parseTotpUri } from "./vault/totp.js";
export type { TOTPConfig, TOTPCode } from "./vault/totp.js";
export { generateVaultKey } from "./vault/crypto.js";
export type { KdfParams } from "./vault/crypto.js";

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
  VaultNotInitializedError,
  VaultAlreadyInitializedError,
  InvalidVaultKeyError,
  VaultSecretNotFoundError,
  VaultSecretTypeError,
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
  SearchMessagesParams,
  SearchMessagesResult,
  EmailMessage,
  ReplyEmailParams,
  ForwardEmailParams,
  ForwardEmailResult,
  DeleteMessageResult,
  DraftAttachment,
  Draft,
  CreateDraftParams,
  UpdateDraftParams,
  ListDraftsParams,
  ListDraftsResult,
  IterDraftsParams,
  SendDraftOverrides,
  SendDraftOptions,
  SendDraftResult,
  DeleteDraftResult,
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
  MarkImessageConversationReadResult,
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
  InboundMailPolicy,
  OutboundMailPolicy,
  MailPolicy,
  SetMailPolicyParams,
  MailRuleDirection,
  MailRuleAction,
  MailRuleStatus,
  MailRuleMatchType,
  MailRule,
  CreateMailRuleParams,
  UpdateMailRuleParams,
  ListMailRulesParams,
  ListMailRulesResult,
  DeleteMailRuleResult,
} from "./types.js";
