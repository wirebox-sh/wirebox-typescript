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
