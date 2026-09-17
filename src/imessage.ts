/**
 * Wirebox TypeScript SDK - iMessage Client
 *
 * Real-world iMessage communication channel for autonomous AI agents.
 * Supports zero-setup QR scan & connect commands, stateful conversations,
 * and high-speed edge message delivery.
 */

import type { HttpTransport } from "./http.js";
import type {
  DisconnectImessageConversationResult,
  GetImessageRouterParams,
  ImessageConversation,
  ImessageRouterInfo,
  ListImessageConversationsParams,
  ListImessageConversationsResult,
  ListImessageMessagesParams,
  ListImessageMessagesResult,
  RequestOptions,
  SendImessageParams,
  SendImessageResult,
} from "./types.js";

export class ImessageClient {
  constructor(private readonly http: HttpTransport) {}

  /**
   * Retrieves the active iMessage router number, agent connect command, and scan-to-connect QR URI.
   *
   * @param params Optional agent handle and user phone number filters.
   * @param options Optional custom request options.
   */
  async getRouter(
    params?: GetImessageRouterParams,
    options?: RequestOptions
  ): Promise<ImessageRouterInfo> {
    const query: Record<string, string | undefined> = {};
    if (params?.agent) {
      query.agent = params.agent.replace(/^@/, "").trim();
    }
    if (params?.user_phone) {
      query.user_phone = params.user_phone.trim();
    }
    return this.http.get<ImessageRouterInfo>("/v1/imessage/router", query, options);
  }

  /**
   * Operations on iMessage conversations.
   */
  readonly conversations = {
    /**
     * Lists iMessage conversations matching the specified filter criteria.
     * Supports cursor-based pagination.
     */
    list: async (
      params?: ListImessageConversationsParams,
      options?: RequestOptions
    ): Promise<ListImessageConversationsResult> => {
      const query: Record<string, string | number | undefined> = {};
      if (params?.identity_id) query.identity_id = params.identity_id;
      if (params?.status) query.status = params.status;
      if (params?.limit !== undefined) query.limit = params.limit;
      if (params?.cursor) query.cursor = params.cursor;

      return this.http.get<ListImessageConversationsResult>(
        "/v1/imessage/conversations",
        query,
        options
      );
    },

    /**
     * Retrieves details of a specific conversation by ID.
     */
    get: async (
      conversationId: string,
      options?: RequestOptions
    ): Promise<ImessageConversation> => {
      return this.http.get<ImessageConversation>(
        `/v1/imessage/conversations/${encodeURIComponent(conversationId)}`,
        undefined,
        options
      );
    },

    /**
     * Disconnects an active conversation session.
     */
    disconnect: async (
      conversationId: string,
      options?: RequestOptions
    ): Promise<DisconnectImessageConversationResult> => {
      return this.http.post<DisconnectImessageConversationResult>(
        `/v1/imessage/conversations/${encodeURIComponent(conversationId)}/disconnect`,
        {},
        options
      );
    },
  };

  /**
   * Operations on iMessage messages.
   */
  readonly messages = {
    /**
     * Lists message history within a conversation, ordered chronologically.
     */
    list: async (
      params: ListImessageMessagesParams,
      options?: RequestOptions
    ): Promise<ListImessageMessagesResult> => {
      const query: Record<string, string | number | undefined> = {
        conversation_id: params.conversation_id,
      };
      if (params.limit !== undefined) query.limit = params.limit;
      if (params.cursor) query.cursor = params.cursor;

      return this.http.get<ListImessageMessagesResult>(
        "/v1/imessage/messages",
        query,
        options
      );
    },

    /**
     * Sends an outbound iMessage to a recipient or active conversation.
     */
    send: async (
      params: SendImessageParams,
      options?: RequestOptions
    ): Promise<SendImessageResult> => {
      const body: Record<string, unknown> = {};
      if (params.conversation_id) body.conversation_id = params.conversation_id;
      if (params.to) body.to = params.to;
      if (params.text !== undefined) body.text = params.text;
      if (params.media_url !== undefined) body.media_url = params.media_url;
      if (params.identity_id) body.identity_id = params.identity_id;

      return this.http.post<SendImessageResult>("/v1/imessage/messages", body, options);
    },
  };
}
