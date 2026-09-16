/**
 * Wirebox TypeScript SDK - Webhooks Client
 *
 * Manages webhook endpoints, subscriptions, ping tests, and secret rotations.
 */

import { HttpTransport } from "./http.js";
import type {
  CreateWebhookParams,
  ListWebhooksParams,
  RequestOptions,
  UpdateWebhookParams,
  Webhook,
  WebhookCreateResult,
  WebhookRotateSecretResult,
  WebhookTestResult,
} from "./types.js";

/**
 * Normalizes an agent handle by stripping any leading '@'
 */
function normalizeHandle(handle?: string): string | undefined {
  if (!handle) return undefined;
  const trimmed = handle.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

export class WebhooksClient {
  constructor(private readonly _http: HttpTransport) {}

  /**
   * Registers a new webhook endpoint.
   *
   * Upon creation, Wirebox generates a dedicated HMAC-SHA256 signing secret.
   * The secret is returned only ONCE in the response (`res.secret`). Store it securely.
   *
   * @param params - Webhook configuration including url, events, and optional agent/mailbox scope.
   */
  async create(
    params: CreateWebhookParams,
    options?: RequestOptions
  ): Promise<WebhookCreateResult> {
    const body: Record<string, any> = {
      url: params.url,
      events: params.events,
    };

    if (params.agent) {
      body.agent = normalizeHandle(params.agent);
    }
    if (params.mailbox) {
      body.mailbox = params.mailbox.trim();
    }
    if (params.auth_token !== undefined) {
      body.auth_token = params.auth_token;
    }

    return this._http.post<WebhookCreateResult>("/v1/webhooks", body, options);
  }

  /**
   * Lists webhook endpoints in the organization.
   *
   * @param params - Optional filters (by agent, mailbox, event) and pagination limits.
   */
  async list(
    params?: ListWebhooksParams,
    options?: RequestOptions
  ): Promise<Webhook[]> {
    const query: Record<string, string | number | boolean | undefined | null> = {};
    if (params?.agent) {
      query.agent = normalizeHandle(params.agent) || "";
    }
    if (params?.mailbox) {
      query.mailbox = params.mailbox.trim();
    }
    if (params?.event) {
      query.event = params.event;
    }
    if (params?.limit !== undefined) {
      query.limit = params.limit;
    }
    if (params?.offset !== undefined) {
      query.offset = params.offset;
    }

    const res = await this._http.get<{ webhooks: Webhook[]; total: number }>(
      "/v1/webhooks",
      query,
      options
    );
    return res.webhooks || [];
  }

  /**
   * Retrieves full details for a single webhook endpoint.
   *
   * @param id - Webhook ID (e.g. "whk_01J8DEF456GHI789")
   */
  async get(id: string, options?: RequestOptions): Promise<Webhook> {
    return this._http.get<Webhook>(`/v1/webhooks/${encodeURIComponent(id)}`, undefined, options);
  }

  /**
   * Updates an existing webhook's destination URL, subscribed events, or status.
   *
   * @param id - Webhook ID to update
   * @param params - Fields to update (url, events, auth_token, or status)
   */
  async update(
    id: string,
    params: UpdateWebhookParams,
    options?: RequestOptions
  ): Promise<Webhook> {
    return this._http.patch<Webhook>(
      `/v1/webhooks/${encodeURIComponent(id)}`,
      params,
      options
    );
  }

  /**
   * Permanently deletes a webhook endpoint.
   *
   * @param id - Webhook ID to remove
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this._http.delete<void>(`/v1/webhooks/${encodeURIComponent(id)}`, options);
  }

  /**
   * Sends an immediate test.ping notification to the destination URL to verify connectivity.
   *
   * @param id - Webhook ID to test
   */
  async test(id: string, options?: RequestOptions): Promise<WebhookTestResult> {
    return this._http.post<WebhookTestResult>(
      `/v1/webhooks/${encodeURIComponent(id)}/test`,
      {},
      options
    );
  }

  /**
   * Convenience alias for test(id).
   */
  async ping(id: string, options?: RequestOptions): Promise<WebhookTestResult> {
    return this.test(id, options);
  }

  /**
   * Generates and returns a fresh signing secret for the webhook endpoint.
   * The previous secret is immediately invalidated.
   *
   * @param id - Webhook ID to rotate secret for
   */
  async rotateSecret(
    id: string,
    options?: RequestOptions
  ): Promise<WebhookRotateSecretResult> {
    return this._http.post<WebhookRotateSecretResult>(
      `/v1/webhooks/${encodeURIComponent(id)}/rotate-secret`,
      {},
      options
    );
  }
}
