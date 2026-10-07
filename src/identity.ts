/**
 * Wirebox TypeScript SDK - AgentIdentity Domain Object
 *
 * Represents an immutable snapshot of an agent identity, equipped with direct
 * methods for lifecycle management and core email communication actions.
 */

import type { HttpTransport } from "./http.js";
import { ImessageClient } from "./imessage.js";
import { IdentityMailRulesClient } from "./mail_rules.js";
import { PhoneClient } from "./phone.js";
import { TunnelsClient } from "./tunnels.js";
import { WebhooksClient } from "./webhooks.js";
import type {
  CreateDraftParams,
  CreateWebhookParams,
  DeleteDraftResult,
  DeleteMessageResult,
  DisconnectImessageConversationResult,
  Draft,
  EmailMessage,
  ForwardEmailParams,
  ForwardEmailResult,
  IdentityData,
  IdentityMailboxSummary,
  IdentityTunnelSummary,
  ImessageMessage,
  ImessageRouterInfo,
  IterDraftsParams,
  IterMessagesParams,
  ListDraftsParams,
  ListDraftsResult,
  ListImessageConversationsResult,
  ListImessageMessagesResult,
  ListMessagesParams,
  ListMessagesResult,
  ListPhoneMessagesParams,
  ListPhoneMessagesResult,
  ListWebhooksParams,
  MailPolicy,
  MarkImessageConversationReadResult,
  MessageSummary,
  PhoneMessage,
  PhoneNumber,
  ProvisionPhoneNumberParams,
  ReplyEmailParams,
  RequestOptions,
  SearchMessagesParams,
  SearchMessagesResult,
  SendDraftOptions,
  SendDraftResult,
  SendEmailParams,
  SendEmailResult,
  SendImessageResult,
  SetMailPolicyParams,
  Tunnel,
  TunnelConnectOptions,
  TunnelSession,
  UpdateDraftParams,
  UpdateIdentityParams,
  Webhook,
  WebhookCreateResult,
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
  readonly imessage_enabled: boolean;
  readonly mail_filter_mode?: "whitelist" | "blacklist";
  readonly mail_inbound_filter_mode?: "whitelist" | "blacklist";
  readonly mail_outbound_filter_mode?: "whitelist" | "blacklist";
  readonly mailPolicy: MailPolicy;
  readonly mailRules: IdentityMailRulesClient;

  private readonly _http: HttpTransport;

  constructor(data: IdentityData, http: HttpTransport) {
    this.id = data.id;
    this.organization_id = data.organization_id;
    this.agent_handle = data.agent_handle;
    this.display_name = data.display_name;
    this.description = data.description ?? null;
    this.status = data.status;
    this.imessage_enabled = Boolean(data.imessage_enabled);
    this.mail_filter_mode = data.mail_filter_mode;
    this.mail_inbound_filter_mode = data.mail_inbound_filter_mode;
    this.mail_outbound_filter_mode = data.mail_outbound_filter_mode;

    const inMode = data.mail_inbound_filter_mode || data.mail_filter_mode;
    const outMode = data.mail_outbound_filter_mode || data.mail_filter_mode;
    this.mailPolicy = {
      inbound: inMode === "whitelist" ? "protected" : "open",
      outbound: outMode === "whitelist" ? "restricted" : "open",
    };

    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.mailRules = new IdentityMailRulesClient(http, this.agent_handle);

    const primaryMbx = data.mailbox || (data.mailboxes && data.mailboxes.length > 0 ? data.mailboxes[0] : undefined);
    this.mailbox = primaryMbx ?? {
      id: "",
      email_address: data.email_address || `${data.agent_handle}@wireboxmail.com`,
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
  async update(params: UpdateIdentityParams, options?: RequestOptions): Promise<AgentIdentity> {
    const updated = await this._http.patch<IdentityData>(
      `/v1/identities/${encodeURIComponent(this.agent_handle)}`,
      params,
      options
    );
    return new AgentIdentity(updated, this._http);
  }

  /**
   * Configures inbound and outbound email security policies for this agent identity.
   *
   * @example
   * ```ts
   * await agent.setMailPolicy({ inbound: "protected", outbound: "restricted" });
   * ```
   *
   * @param policy Inbound ('protected' | 'open') and outbound ('restricted' | 'open') postures.
   * @param options Optional custom request options.
   * @returns An updated AgentIdentity instance reflecting the new security posture.
   */
  async setMailPolicy(
    policy: SetMailPolicyParams,
    options?: RequestOptions
  ): Promise<AgentIdentity> {
    let targetInbound: "whitelist" | "blacklist" | undefined;
    if (policy.inbound !== undefined) {
      targetInbound =
        policy.inbound === "protected" || policy.inbound === "allowlist"
          ? "whitelist"
          : "blacklist";
    }

    let targetOutbound: "whitelist" | "blacklist" | undefined;
    if (policy.outbound !== undefined) {
      targetOutbound =
        policy.outbound === "restricted" || policy.outbound === "allowlist"
          ? "whitelist"
          : "blacklist";
    }

    return this.update(
      {
        mail_inbound_filter_mode: targetInbound,
        mail_outbound_filter_mode: targetOutbound,
      },
      options
    );
  }

  /**
   * Alias for setMailPolicy().
   */
  async setMailPolicies(
    policies: SetMailPolicyParams,
    options?: RequestOptions
  ): Promise<AgentIdentity> {
    return this.setMailPolicy(policies, options);
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
      if (page.total !== undefined && offset >= page.total) {
        break;
      }
      if (page.has_more === false) {
        break;
      }
    }
  }

  /**
   * Full-text search across this agent's mailbox, ranked by relevance.
   *
   * @example
   * const { messages } = await agent.searchMessages({ q: "invoice overdue" });
   * console.log(messages[0]?.highlight);
   */
  async searchMessages(params: SearchMessagesParams): Promise<SearchMessagesResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.get<SearchMessagesResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/search`,
      {
        q: params.q,
        limit: params.limit,
      }
    );
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
   * Forwards an existing email message to new recipients.
   *
   * Automatically generates an independent conversation thread, RFC quote headers,
   * and preserves original Cloudflare R2 attachments by default.
   */
  async forwardEmail(message_id: string, params: ForwardEmailParams): Promise<ForwardEmailResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.post<ForwardEmailResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/messages/${encodeURIComponent(message_id)}/forward`,
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
  // Email Draft Methods
  // ==========================================================================

  /**
   * Creates a new email draft (plain, reply, or forward).
   */
  async createDraft(params: CreateDraftParams, options?: RequestOptions): Promise<Draft> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.post<Draft>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/drafts`,
      params,
      options
    );
  }

  /**
   * Retrieves a paginated list of drafts in this agent's mailbox.
   */
  async listDrafts(params?: ListDraftsParams, options?: RequestOptions): Promise<ListDraftsResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.get<ListDraftsResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/drafts`,
      {
        limit: params?.limit,
        offset: params?.offset,
      },
      options
    );
  }

  /**
   * Auto-paginating async generator yielding drafts across the draft mailbox.
   *
   * @example
   * for await (const draft of agent.iterDrafts()) {
   *   console.log(draft.subject, draft.version);
   * }
   */
  async *iterDrafts(params?: IterDraftsParams): AsyncGenerator<Draft, void, unknown> {
    const limit = params?.limit ?? 50;
    let offset = 0;

    while (true) {
      const page = await this.listDrafts({ limit, offset });
      if (!page.drafts || page.drafts.length === 0) {
        break;
      }

      for (const draft of page.drafts) {
        yield draft;
      }

      offset += page.drafts.length;
      if (page.count !== undefined && offset >= page.count) {
        break;
      }
    }
  }

  /**
   * Retrieves complete details of an email draft, including signed attachment download URLs.
   */
  async getDraft(draft_id: string, options?: RequestOptions): Promise<Draft> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.get<Draft>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/drafts/${encodeURIComponent(draft_id)}`,
      undefined,
      options
    );
  }

  /**
   * Updates an existing email draft with delta body, recipients, attachments, or version check.
   */
  async updateDraft(
    draft_id: string,
    params: UpdateDraftParams,
    options?: RequestOptions
  ): Promise<Draft> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.patch<Draft>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/drafts/${encodeURIComponent(draft_id)}`,
      params,
      options
    );
  }

  /**
   * Permanently deletes a draft and purges its draft-scoped attachments from storage.
   */
  async deleteDraft(draft_id: string, options?: RequestOptions): Promise<DeleteDraftResult> {
    const mailboxAddress = this.mailbox.email_address;
    return this._http.delete<DeleteDraftResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/drafts/${encodeURIComponent(draft_id)}`,
      options
    );
  }

  /**
   * Sends an email draft, promoting attachments and converting it into a sent message.
   *
   * @param draft_id Unique draft ID to dispatch.
   * @param options Optional overrides, custom headers, or Idempotency-Key.
   */
  async sendDraft(draft_id: string, options?: SendDraftOptions): Promise<SendDraftResult> {
    const mailboxAddress = this.mailbox.email_address;
    const headers: Record<string, string> = {};
    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    const reqOptions: RequestOptions = {
      ...options,
      headers: { ...headers, ...options?.headers },
    };
    const body: Record<string, unknown> = {
      ...(options?.overrides || {}),
    };
    if (options?.version !== undefined) {
      body.version = options.version;
    }
    return this._http.post<SendDraftResult>(
      `/v1/mailboxes/${encodeURIComponent(mailboxAddress)}/drafts/${encodeURIComponent(draft_id)}/send`,
      body,
      reqOptions
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

  // ==========================================================================
  // Webhook Subscription Methods
  // ==========================================================================

  /**
   * Registers a new webhook subscription scoped specifically to this agent.
   */
  async createWebhook(
    params: Omit<CreateWebhookParams, "agent">,
    options?: RequestOptions
  ): Promise<WebhookCreateResult> {
    const webhooks = new WebhooksClient(this._http);
    return webhooks.create({ ...params, agent: this.agent_handle }, options);
  }

  /**
   * Lists active webhook endpoints associated with this agent.
   */
  async listWebhooks(
    params?: Omit<ListWebhooksParams, "agent">,
    options?: RequestOptions
  ): Promise<Webhook[]> {
    const webhooks = new WebhooksClient(this._http);
    return webhooks.list({ ...params, agent: this.agent_handle }, options);
  }

  // ==========================================================================
  // Core iMessage Methods
  // ==========================================================================

  /**
   * Retrieves this agent's iMessage router info, connect command, and QR code URI.
   *
   * @param userPhone Optional user phone number to check router line mapping.
   * @param options Optional custom request options.
   */
  async getImessageRouter(
    userPhone?: string,
    options?: RequestOptions
  ): Promise<ImessageRouterInfo> {
    const imessage = new ImessageClient(this._http);
    return imessage.getRouter(
      { agent: this.agent_handle, user_phone: userPhone },
      options
    );
  }

  /**
   * Sends an outbound iMessage from this agent identity.
   *
   * @param params Message parameters (to or conversation_id, text, and/or media_url).
   * @param options Optional custom request options.
   */
  async sendImessage(
    params: {
      conversation_id?: string;
      to?: string;
      text?: string;
      media_url?: string;
    },
    options?: RequestOptions
  ): Promise<SendImessageResult> {
    const imessage = new ImessageClient(this._http);
    return imessage.messages.send(
      {
        ...params,
        identity_id: this.id,
      },
      options
    );
  }

  /**
   * Lists iMessage conversations owned by this agent identity.
   *
   * @param params Optional filters (status, limit, cursor).
   * @param options Optional custom request options.
   */
  async listImessageConversations(
    params?: {
      status?: "connected" | "disconnected";
      limit?: number;
      cursor?: string;
    },
    options?: RequestOptions
  ): Promise<ListImessageConversationsResult> {
    const imessage = new ImessageClient(this._http);
    return imessage.conversations.list(
      {
        ...params,
        identity_id: this.id,
      },
      options
    );
  }

  /**
   * Lists message history within a specific conversation.
   *
   * @param conversationId The conversation ID.
   * @param params Optional limit and cursor.
   * @param options Optional custom request options.
   */
  async listImessageMessages(
    conversationId: string,
    params?: { limit?: number; cursor?: string },
    options?: RequestOptions
  ): Promise<ListImessageMessagesResult> {
    const imessage = new ImessageClient(this._http);
    return imessage.messages.list(
      {
        conversation_id: conversationId,
        limit: params?.limit,
        cursor: params?.cursor,
      },
      options
    );
  }

  /**
   * Auto-paginating async generator yielding messages chronologically across an iMessage conversation.
   *
   * @example
   * for await (const msg of agent.iterImessageMessages(convId)) {
   *   console.log(msg.sender, msg.text);
   * }
   */
  async *iterImessageMessages(
    conversationId: string,
    options?: { limit?: number }
  ): AsyncGenerator<ImessageMessage, void, unknown> {
    const limit = options?.limit ?? 50;
    let cursor: string | undefined = undefined;

    while (true) {
      const page = await this.listImessageMessages(conversationId, { limit, cursor });
      if (!page.data || page.data.length === 0) {
        break;
      }

      for (const message of page.data) {
        yield message;
      }

      if (!page.has_more || !page.next_cursor) {
        break;
      }

      cursor = page.next_cursor;
    }
  }

  /**
   * Disconnects an active conversation session.
   *
   * @param conversationId The conversation ID.
   * @param options Optional custom request options.
   */
  async disconnectImessageConversation(
    conversationId: string,
    options?: RequestOptions
  ): Promise<DisconnectImessageConversationResult> {
    const imessage = new ImessageClient(this._http);
    return imessage.conversations.disconnect(conversationId, options);
  }

  /**
   * Marks every inbound message in an iMessage conversation as read and resets unread count.
   *
   * @param conversationId The conversation ID.
   * @param options Optional custom request options.
   */
  async markImessageConversationRead(
    conversationId: string,
    options?: RequestOptions
  ): Promise<MarkImessageConversationReadResult> {
    const imessage = new ImessageClient(this._http);
    return imessage.conversations.read(conversationId, options);
  }

  // ==========================================================================
  // Phone & SMS Communication Methods
  // ==========================================================================

  /**
   * Provisions a carrier phone number for this agent identity.
   *
   * @param params Optional geographic parameters (region / area code).
   * @param options Optional custom request options.
   */
  async provisionPhoneNumber(
    params?: Omit<ProvisionPhoneNumberParams, "agent_handle">,
    options?: RequestOptions
  ): Promise<PhoneNumber> {
    const phone = new PhoneClient(this._http);
    return phone.numbers.provision(
      {
        agent_handle: this.agent_handle,
        ...params,
      },
      options
    );
  }

  /**
   * Retrieves this agent identity's phone number details.
   *
   * @param options Optional custom request options.
   */
  async getPhoneNumber(options?: RequestOptions): Promise<PhoneNumber> {
    const phone = new PhoneClient(this._http);
    return phone.numbers.get(this.agent_handle, options);
  }

  /**
   * Releases this agent identity's phone number back to the carrier.
   *
   * @param options Optional custom request options.
   */
  async releasePhoneNumber(options?: RequestOptions): Promise<void> {
    const phone = new PhoneClient(this._http);
    return phone.numbers.release(this.agent_handle, options);
  }

  /**
   * Scoped phone and SMS operations for this agent identity.
   */
  readonly phone = {
    /**
     * Lists SMS/MMS messages received by this agent identity, newest first.
     */
    listMessages: async (
      params?: ListPhoneMessagesParams,
      options?: RequestOptions
    ): Promise<ListPhoneMessagesResult> => {
      const phone = new PhoneClient(this._http);
      return phone.messages.list(this.agent_handle, params, options);
    },

    /**
     * Retrieves a single SMS/MMS message received by this agent.
     */
    getMessage: async (
      messageId: string,
      options?: RequestOptions
    ): Promise<PhoneMessage> => {
      const phone = new PhoneClient(this._http);
      return phone.messages.get(this.agent_handle, messageId, options);
    },

    /**
     * Marks an SMS/MMS message as read.
     */
    markMessageRead: async (
      messageId: string,
      options?: RequestOptions
    ): Promise<PhoneMessage> => {
      const phone = new PhoneClient(this._http);
      return phone.messages.markRead(this.agent_handle, messageId, options);
    },
  };
}
