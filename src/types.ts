/**
 * Wirebox TypeScript SDK - Core Type Definitions
 *
 * All request payloads use snake_case matching the Wirebox Core REST API 1:1.
 * Method parameters and return values preserve protocol fidelity while adhering to idiomatic TypeScript.
 */

// ============================================================================
// Client Configuration
// ============================================================================

export interface ClientOptions {
  /**
   * Wirebox API key (e.g. "wb_live_...").
   * If omitted, falls back to WIREBOX_API_KEY environment variable,
   * then to ~/.wirebox/config.
   */
  apiKey?: string;

  /**
   * Base URL of the Wirebox API.
   * Defaults to "https://api.wirebox.sh".
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds. Defaults to 30000 (30 seconds).
   */
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Override API key for this specific request */
  apiKey?: string;

  /** Override request timeout in milliseconds */
  timeoutMs?: number;

  /** Additional custom headers to include */
  headers?: Record<string, string>;
}

// ============================================================================
// Identity Types
// ============================================================================

export interface CreateIdentityParams {
  /**
   * Globally unique slug for the agent identity.
   * Rules: 3 to 63 characters; lowercase letters, numbers, and hyphens;
   * must start and end with an alphanumeric character; no consecutive hyphens.
   * Leading '@' is automatically stripped if provided.
   */
  agent_handle: string;

  /** Human-friendly name for display. Defaults server-side to agent_handle if omitted. */
  display_name?: string;

  /** Optional description explaining the agent's role or purpose. */
  description?: string;
}

export interface UpdateIdentityParams {
  /** Updated display name */
  display_name?: string;

  /**
   * Updated description.
   * - Passing a string updates the description.
   * - Passing null explicitly clears the description in the database.
   * - Omitting the field leaves the existing description unchanged.
   */
  description?: string | null;
}

export interface IdentityMailboxSummary {
  readonly id: string;
  readonly email_address: string;
  readonly created_at: string;
}

export interface IdentityTunnelSummary {
  readonly id: string;
  readonly public_url: string;
  readonly status: "active" | "disabled";
  readonly is_connected: boolean;
}

export interface IdentityData {
  readonly id: string;
  readonly organization_id: string;
  readonly agent_handle: string;
  readonly display_name: string;
  readonly description: string | null;
  readonly status: "active" | "archived" | "deleted";
  readonly created_at: string;
  readonly updated_at: string;
  readonly mailboxes?: IdentityMailboxSummary[];
  readonly tunnel?: IdentityTunnelSummary;
  readonly tunnels?: IdentityTunnelSummary[];
}

export interface ListIdentitiesParams {
  limit?: number;
  offset?: number;
  status?: "active" | "archived" | "deleted";
}

// Forward reference for AgentIdentity in ListIdentitiesResult
import type { AgentIdentity } from "./identity.js";

export interface ListIdentitiesResult {
  readonly identities: AgentIdentity[];
  readonly total: number;
}

// ============================================================================
// Email Types
// ============================================================================

export interface SendEmailAttachment {
  /** File display name, e.g. "report.pdf" */
  filename: string;

  /** MIME content type, e.g. "application/pdf" */
  content_type: string;

  /** Base64-encoded file content (either content or url must be provided) */
  content?: string;

  /** Public HTTP/HTTPS URL from which the edge worker will fetch the asset */
  url?: string;

  /** Optional Content-ID for embedding images inline in HTML bodies (cid:<content_id>) */
  content_id?: string;
}

export interface MessageAttachmentSummary {
  readonly filename: string;
  readonly content_type: string;
  readonly size_bytes?: number;
  readonly content_id?: string | null;
}

export interface SendEmailParams {
  /** Primary recipient email address or array of addresses */
  to: string | string[];

  /** Email subject line */
  subject: string;

  /** Plain text email body */
  text: string;

  /** Optional rich HTML formatted body */
  html?: string;

  /** Optional Carbon Copy recipient(s) */
  cc?: string | string[];

  /** Optional Blind Carbon Copy recipient(s) */
  bcc?: string | string[];

  /** Optional Reply-To address */
  reply_to?: string;

  /** Optional file attachments */
  attachments?: SendEmailAttachment[];
}

export interface SendEmailResult {
  readonly message_id: string;
  readonly mailbox_address: string;
  readonly status: "queued" | "sent";
  readonly created_at: string;
}

export interface ListMessagesParams {
  limit?: number;
  offset?: number;
  status?: "queued" | "sent" | "delivered" | "bounced" | "failed";
}

export interface MessageSummary {
  readonly id: string;
  readonly direction: "inbound" | "outbound";
  readonly subject: string;
  readonly from_address: string;
  readonly to_addresses: string[];
  readonly cc_addresses?: string[];
  readonly status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  readonly created_at: string;
  readonly snippet?: string;
}

export interface ListMessagesResult {
  readonly messages: MessageSummary[];
  readonly total: number;
}

export interface IterMessagesParams {
  /** Batch size per internal page fetch (default 50, max 100) */
  limit?: number;

  /** Filter by delivery status */
  status?: "queued" | "sent" | "delivered" | "bounced" | "failed";
}

export interface EmailMessage {
  readonly id: string;
  readonly mailbox_id: string;
  readonly direction: "inbound" | "outbound";
  readonly from_address: string;
  readonly to_addresses: string[];
  readonly cc_addresses: string[];
  readonly bcc_addresses: string[];
  readonly reply_to: string | null;
  readonly subject: string;
  readonly text: string | null;
  readonly html: string | null;
  readonly attachments: MessageAttachmentSummary[];
  readonly headers?: Record<string, string>;
  readonly status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  readonly created_at: string;
}

export interface ReplyEmailParams {
  /** Plain text response body */
  text: string;

  /** Optional HTML response body */
  html?: string;

  /** Override recipient (defaults automatically to original sender) */
  to?: string | string[];

  /** Optional CC addresses */
  cc?: string | string[];

  /** Optional BCC addresses */
  bcc?: string | string[];

  /** Optional file attachments */
  attachments?: SendEmailAttachment[];
}

export interface DeleteMessageResult {
  readonly deleted: boolean;
  readonly message_id: string;
}

// ============================================================================
// Agent Self-Signup Types
// ============================================================================

export interface AgentSignupParams {
  /**
   * The primary email address of the supervising human operator.
   * Required for abuse prevention and OTP verification delivery.
   */
  human_email: string;

  /** Friendly display name for the agent (defaults to "Agent") */
  display_name?: string;

  /** Human-readable note from the agent to the supervisor */
  note_to_human?: string;

  /** Agent runtime harness tag (e.g. "claude-code", "opencode") */
  harness?: string;
}

export interface AgentSignupResult {
  readonly api_key: string;
  readonly email_address: string;
}

export interface AgentVerifySignupParams {
  /** The 6-digit numeric verification code */
  verification_code: string;
}

export interface AgentVerifySignupResult {
  readonly verified: boolean;
}

// ============================================================================
// Telemetry & Introspection Types (whoami / me)
// ============================================================================

export interface WhoamiOrganization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly billing_plan: string;
  readonly is_claimed: boolean;
  readonly claimed_by_email: string | null;
  readonly created_at: string;
}

export interface WhoamiAuth {
  readonly type: "api_key" | "jwt";
  readonly actor_id: string;
  readonly scoped_identity_id: string | null;
  readonly scopes: string[];
}

export interface WhoamiUsage {
  readonly agents_count: number;
  readonly agents_limit: number;
  readonly webhooks_count: number;
  readonly webhooks_limit: number;
}

export interface WhoamiResult {
  readonly organization: WhoamiOrganization;
  readonly auth: WhoamiAuth;
  readonly usage: WhoamiUsage;
}

// ============================================================================
// Tunnel Types
// ============================================================================

export interface TunnelClientInfo {
  readonly ip: string;
  readonly version: string;
  readonly forward_to: string;
}

export interface Tunnel {
  readonly id: string;
  readonly organization_id: string;
  readonly agent_identity_id: string;
  readonly agent_handle: string;
  readonly public_url: string;
  readonly public_host: string;
  readonly status: "active" | "disabled";
  readonly is_connected: boolean;
  readonly connected_clients: number;
  readonly connected_at: string | null;
  readonly disconnected_at: string | null;
  readonly client: TunnelClientInfo | null;
  readonly last_request_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ListTunnelsParams {
  is_connected?: boolean;
  status?: "active" | "disabled";
  limit?: number;
}

export interface UpdateTunnelParams {
  status: "active" | "disabled";
}

export interface TunnelRequestEvent {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly error?: string;
}

export interface WireboxWebSocket {
  readonly connId: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  send(data: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: string | Uint8Array, isBinary: boolean) => void): this;
  on(event: "close", listener: (code: number, reason: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export interface TunnelConnectOptions {
  /**
   * Local port or URL to proxy incoming requests to (e.g. 3000, 8000, "http://localhost:3000", "http://127.0.0.1:8000").
   */
  forwardTo?: string | number;

  /**
   * In-memory Web Fetch Handler. When provided, inbound requests will be evaluated
   * directly in-process without needing a listening TCP port.
   */
  handler?: (req: Request) => Promise<Response> | Response;

  /**
   * In-memory WebSocket handler. When provided, inbound WebSocket upgrades will be
   * evaluated directly in-process without needing a listening TCP port.
   */
  wsHandler?: (ws: WireboxWebSocket) => Promise<void> | void;

  /** Custom client version header */
  clientVersion?: string;

  /** Callback triggered when tunnel connection status changes */
  onStatusChange?: (status: { connected: boolean; error?: string }) => void;

  /** Callback triggered whenever a proxied request finishes */
  onRequest?: (event: TunnelRequestEvent) => void;

  /** Optional custom WebSocket constructor (for non-standard environments) */
  WebSocket?: any;
}

export interface TunnelSession {
  readonly publicUrl: string;
  readonly publicHost: string;
  readonly agentHandle: string;
  readonly isConnected: boolean;

  /** Closes the active tunnel WebSocket connection cleanly */
  close(): Promise<void>;

  /** Awaits until the tunnel session has closed (ideal for long-running CLI/daemon processes) */
  waitClosed(): Promise<void>;
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEventType =
  // Email Events
  | "email.received"
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.failed"
  // SMS Events
  | "sms.received"
  | "sms.sent"
  | "sms.delivered"
  | "sms.failed"
  // iMessage Events
  | "imessage.connected"
  | "imessage.disconnected"
  | "imessage.received"
  | "imessage.sent"
  | "imessage.delivered"
  | "imessage.failed"
  // System Events
  | "test.ping"
  | "*"
  | string;

export type WebhookStatus = "active" | "paused";

export interface Webhook {
  readonly id: string;
  readonly agent_handle: string | null;
  readonly mailbox_address: string | null;
  readonly url: string;
  readonly events: WebhookEventType[];
  readonly auth_token: string | null;
  readonly has_auth_token: boolean;
  readonly status: WebhookStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WebhookCreateResult extends Webhook {
  /**
   * Plaintext HMAC-SHA256 signing secret (whsec_...).
   * Returned ONLY ONCE upon creation or secret rotation.
   */
  readonly secret: string;
}

export interface CreateWebhookParams {
  /** Destination HTTPS URL */
  url: string;
  /** Non-empty list of event types to subscribe to */
  events: WebhookEventType[];
  /** Optional agent handle to scope events (e.g. "sales-bot" or "@sales-bot") */
  agent?: string;
  /** Optional mailbox address to scope events */
  mailbox?: string;
  /** Optional bearer authorization token */
  auth_token?: string | null;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEventType[];
  auth_token?: string | null;
  status?: WebhookStatus;
}

export interface ListWebhooksParams {
  mailbox?: string;
  agent?: string;
  event?: string;
  limit?: number;
  offset?: number;
}

export interface WebhookTestResult {
  readonly webhook_id: string;
  readonly url: string;
  readonly event_type: string;
  readonly status_code: number | null;
  readonly latency_ms: number;
  readonly success: boolean;
  readonly error: string | null;
}

export interface WebhookRotateSecretResult {
  readonly id: string;
  readonly secret: string;
  readonly updated_at: string;
}

export interface VerifyWebhookOptions {
  /** Raw payload body as string, Buffer, or Uint8Array */
  payload: string | Uint8Array;
  /** Request headers object or Headers instance */
  headers: Record<string, string | string[] | undefined> | Headers;
  /** Signing secret ('whsec_...') */
  secret: string;
  /** Allowed clock skew in milliseconds (default 300,000 ms / 5 minutes) */
  toleranceMs?: number;
}

// ============================================================================
// iMessage Types
// ============================================================================

export interface ImessageRouterInfo {
  readonly router_number: string;
  readonly agent_handle: string;
  readonly connect_command: string;
  readonly qr_uri: string;
  readonly status: "online" | "offline" | string;
}

export interface GetImessageRouterParams {
  /** Optional agent handle or identity ID to resolve dedicated connect command */
  agent?: string;
  /** Optional caller's phone number to check assigned router line */
  user_phone?: string;
}

export interface ImessageConversationLastMessage {
  readonly id: string;
  readonly direction: "inbound" | "outbound";
  readonly text: string | null;
  readonly has_media: boolean;
  readonly created_at: string;
}

export interface ImessageConversation {
  readonly id: string;
  readonly identity_id: string;
  readonly user_phone: string;
  readonly status: "connected" | "disconnected";
  readonly unread_count: number;
  readonly last_message: ImessageConversationLastMessage | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ListImessageConversationsParams {
  /** Filter conversations by agent identity ID */
  identity_id?: string;
  /** Filter by session status */
  status?: "connected" | "disconnected";
  /** Maximum number of conversations to return (1-100, default: 20) */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

export interface ListImessageConversationsResult {
  readonly data: ImessageConversation[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface DisconnectImessageConversationResult {
  readonly id: string;
  readonly status: "disconnected";
  readonly disconnected_at: string;
}

export interface ImessageMessage {
  readonly id: string;
  readonly conversation_id: string;
  readonly identity_id: string;
  readonly direction: "inbound" | "outbound";
  readonly sender: string;
  readonly text: string | null;
  readonly media_url: string | null;
  readonly is_read: boolean;
  readonly created_at: string;
}

export interface ListImessageMessagesParams {
  /** The conversation ID whose messages are retrieved */
  conversation_id: string;
  /** Maximum number of messages to return (1-100, default: 50) */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

export interface ListImessageMessagesResult {
  readonly data: ImessageMessage[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface SendImessageParams {
  /** Existing conversation ID to reply into (mutually exclusive with 'to') */
  conversation_id?: string;
  /** Recipient E.164 phone number (mutually exclusive with 'conversation_id') */
  to?: string;
  /** Text body of the message */
  text?: string;
  /** Public HTTPS URL of the media attachment to send */
  media_url?: string;
  /** Target agent identity ID (required when using Organization Admin key, optional when identity-scoped) */
  identity_id?: string;
}

export interface SendImessageResult {
  readonly id: string;
  readonly conversation_id: string;
  readonly identity_id: string;
  readonly direction: "outbound";
  readonly to: string;
  readonly text: string | null;
  readonly media_url: string | null;
  readonly status: "sent";
  readonly created_at: string;
}

// ============================================================================
// Phone & SMS Types
// ============================================================================

export interface PhoneNumberCapabilities {
  readonly sms: boolean;
  readonly mms: boolean;
  readonly voice: boolean;
}

export interface PhoneNumber {
  readonly id: string;
  readonly phone_number: string;
  readonly country_code: string;
  readonly type: "local" | "toll_free" | string;
  readonly region: string | null;
  readonly agent_handle: string;
  readonly agent_identity_id: string;
  readonly status: "active" | "released" | string;
  readonly sms_status: "ready" | "pending" | "assignment_failed" | string;
  readonly sms_error_code: string | null;
  readonly sms_error_detail: string | null;
  readonly sms_ready_at: string | null;
  readonly capabilities: PhoneNumberCapabilities;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProvisionPhoneNumberParams {
  /** Target agent handle (required for top-level client; automatically injected on AgentIdentity) */
  agent_handle: string;
  /** Country code: "US" or "CA" (defaults to "US") */
  country_code?: "US" | "CA";
  /** Type of phone number: "local" or "toll_free" (defaults to "local") */
  type?: "local" | "toll_free";
  /** Two-letter US state or CA province code (e.g. "CA", "NY"). Mutually exclusive with area_code. */
  region?: string;
  /** 3-digit area code (e.g. "415", "212"). Mutually exclusive with region. */
  area_code?: string;
}

export interface ListPhoneNumbersParams {
  limit?: number;
  cursor?: string;
  status?: "active" | "released" | string;
  sms_status?: "ready" | "pending" | "assignment_failed" | string;
}

export interface ListPhoneNumbersResult {
  readonly numbers: PhoneNumber[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface PhoneMediaItem {
  readonly content_type: string;
  readonly size_bytes: number;
  readonly url: string | null;
}

export interface PhoneMessage {
  readonly id: string;
  readonly phone_number: string;
  readonly agent_handle: string;
  readonly direction: "inbound" | "outbound" | string;
  readonly type: "sms" | "mms" | string;
  readonly from_number: string;
  readonly to_numbers: string[];
  readonly text: string;
  readonly media: PhoneMediaItem[] | null;
  readonly is_read: boolean;
  readonly segments: number;
  readonly created_at: string;
}

export interface ListPhoneMessagesParams {
  limit?: number;
  cursor?: string;
  is_read?: boolean;
  from_number?: string;
}

export interface ListPhoneMessagesResult {
  readonly messages: PhoneMessage[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface UpdatePhoneMessageParams {
  is_read: boolean;
}


