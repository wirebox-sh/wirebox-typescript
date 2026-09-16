/**
 * Wirebox TypeScript SDK - AgentIdentity Domain Object
 *
 * Represents an immutable snapshot of an agent identity, equipped with direct
 * methods for lifecycle management and core email communication actions.
 */

import type { HttpTransport } from "./http.js";
import { TunnelsClient } from "./tunnels.js";
import type {
  DeleteMessageResult,
  EmailMessage,
  IdentityData,
  IdentityMailboxSummary,
  IdentityTunnelSummary,
  IterMessagesParams,
  ListMessagesParams,
  ListMessagesResult,
  MessageSummary,
  ReplyEmailParams,
  SendEmailParams,
  SendEmailResult,
  Tunnel,
  TunnelConnectOptions,
  TunnelSession,
  UpdateIdentityParams,
} from "./types.js";

export class AgentIdentity {
  readonly id: string;
  readonly organization_id: string;
  readonly agent_handle: string;
  readonly display_name: string;
  readonly description: string | null;
  readonly status: "active" | "archived" | "deleted";
  readonly created_at: string;
  readonly updated_at: string;
  readonly mailbox: IdentityMailboxSummary;
  readonly tunnel: IdentityTunnelSummary;

  private readonly _http: HttpTransport;

  constructor(data: IdentityData, http: HttpTransport) {
    this.id = data.id;
    this.organization_id = data.organization_id;
    this.agent_handle = data.agent_handle;
    this.display_name = data.display_name;
    this.description = data.description ?? null;
    this.status = data.status;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;

    const primaryMbx = data.mailboxes && data.mailboxes.length > 0 ? data.mailboxes[0] : undefined;
    this.mailbox = primaryMbx ?? {
      id: "",
      email_address: `${data.agent_handle}@wireboxmail.com`,
      created_at: data.created_at,
    };

    const primaryTun = data.tunnel || (data.tunnels && data.tunnels.length > 0 ? data.tunnels[0] : undefined);
    this.tunnel = primaryTun ?? {
      id: "",
      public_url: `https://${data.agent_handle}.wirebox.run`,
      status: "active",
      is_connected: false,
    };

    this._http = http;
  }

  // ==========================================================================
  // Identity Lifecycle Methods
  // ==========================================================================

  /**
   * Updates this agent identity's profile attributes.
   * Returns a new AgentIdentity instance reflecting the updated state.
   */
  async update(params: UpdateIdentityParams): Promise<AgentIdentity> {
    const updated = await this._http.patch<IdentityData>(
      `/v1/identities/${encodeURIComponent(this.agent_handle)}`,
      params
    );
    return new AgentIdentity(updated, this._http);
  }

  /**
   * Permanently deletes this agent identity and its associated mailbox.
   */
  async delete(): Promise<void> {
    await this._http.delete<void>(`/v1/identities/${encodeURIComponent(this.agent_handle)}`);
  }

  // ==========================================================================
  // Core Email Methods
  // ==========================================================================

  /**
   * Sends an email from this agent's mailbox.
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.post<SendEmailResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/messages`,
      params
    );
  }

  /**
   * Retrieves a single paginated page of message summaries from this agent's mailbox.
   */
  async listMessages(params?: ListMessagesParams): Promise<ListMessagesResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.get<ListMessagesResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/messages`,
      {
        limit: params?.limit,
        offset: params?.offset,
        status: params?.status,
      }
    );
  }

  /**
   * Auto-paginating async generator yielding message summaries across the inbox.
   *
   * @example
   * for await (const msg of agent.iterMessages()) {
   *   console.log(msg.subject);
   * }
   */
  async *iterMessages(params?: IterMessagesParams): AsyncGenerator<MessageSummary, void, unknown> {
    const limit = params?.limit ?? 50;
    let offset = 0;

    while (true) {
      const page = await this.listMessages({
        limit,
        offset,
        status: params?.status,
      });

      if (!page.messages || page.messages.length === 0) {
        break;
      }

      for (const message of page.messages) {
        yield message;
      }

      offset += page.messages.length;
      if (offset >= page.total) {
        break;
      }
    }
  }

  /**
   * Retrieves the full content (text body, HTML, attachments, headers) of an email message.
   */
  async getMessage(message_id: string): Promise<EmailMessage> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.get<EmailMessage>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/messages/${encodeURIComponent(message_id)}`
    );
  }

  /**
   * Replies to an existing email message, automatically preserving thread context and RFC headers.
   */
  async replyEmail(message_id: string, params: ReplyEmailParams): Promise<SendEmailResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.post<SendEmailResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/messages/${encodeURIComponent(message_id)}/reply`,
      params
    );
  }

  /**
   * Deletes an email message from this agent's mailbox.
   */
  async deleteMessage(message_id: string): Promise<DeleteMessageResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.delete<DeleteMessageResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/messages/${encodeURIComponent(message_id)}`
    );
  }

  // ==========================================================================
  // Core Network Tunnel Methods
  // ==========================================================================

  /**
   * Retrieves full details and live status for this agent's network tunnel.
   */
  async getTunnel(): Promise<Tunnel> {
    return this._http.get<Tunnel>(`/v1/identities/${encodeURIComponent(this.agent_handle)}/tunnel`);
  }

  /**
   * Connects this agent's tunnel to a local port or in-memory handler.
   */
  async connectTunnel(options?: TunnelConnectOptions): Promise<TunnelSession> {
    const tunnelsClient = new TunnelsClient(this._http, this._http.currentApiKey, this._http.currentBaseUrl);
    return tunnelsClient.connect(this.agent_handle, options);
  }
}
