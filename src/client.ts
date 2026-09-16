/**
 * Wirebox TypeScript SDK - Wirebox Main Client
 *
 * Provides static self-signup methods, identity management, and caller introspection.
 */

import { resolveApiKey } from "./credentials.js";
import { AuthenticationError, NotFoundError } from "./errors.js";
import { HttpTransport } from "./http.js";
import { AgentIdentity } from "./identity.js";
import { TunnelsClient } from "./tunnels.js";
import { WebhooksClient } from "./webhooks.js";
import type {
  AgentSignupParams,
  AgentSignupResult,
  AgentVerifySignupParams,
  AgentVerifySignupResult,
  ClientOptions,
  CreateIdentityParams,
  IdentityData,
  ListIdentitiesParams,
  ListIdentitiesResult,
  RequestOptions,
  WhoamiResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.wirebox.sh";

export class Wirebox {
  readonly tunnels: TunnelsClient;
  readonly webhooks: WebhooksClient;
  private readonly _http: HttpTransport;
  private readonly _apiKey?: string;

  constructor(options?: ClientOptions) {
    const apiKey = resolveApiKey(options?.apiKey);
    const baseUrl =
      options?.baseUrl ||
      (typeof process !== "undefined" && process?.env?.WIREBOX_BASE_URL) ||
      DEFAULT_BASE_URL;

    this._apiKey = apiKey;
    this._http = new HttpTransport({
      baseUrl,
      apiKey,
      defaultTimeoutMs: options?.timeoutMs,
    });
    this.tunnels = new TunnelsClient(this._http, apiKey, baseUrl);
    this.webhooks = new WebhooksClient(this._http);
  }

  // ==========================================================================
  // Static Zero-Setup Registration Methods
  // ==========================================================================

  /**
   * Self-register a new agent identity and mailbox with zero pre-existing credentials.
   *
   * @param params - Registration parameters including the human supervisor email.
   * @param options - Optional custom endpoint / timeout settings.
   */
  static async signup(
    params: AgentSignupParams,
    options?: ClientOptions
  ): Promise<AgentSignupResult> {
    const baseUrl = options?.baseUrl || DEFAULT_BASE_URL;
    const transport = new HttpTransport({
      baseUrl,
      defaultTimeoutMs: options?.timeoutMs,
    });

    return transport.post<AgentSignupResult>("/v1/agent-signup", params);
  }

  /**
   * Verify an unclaimed agent identity using the 6-digit OTP code sent to the human.
   *
   * @param apiKey - The API key received during signup.
   * @param params - Verification payload containing the 6-digit code.
   * @param options - Optional custom endpoint / timeout settings.
   */
  static async verifySignup(
    apiKey: string,
    params: AgentVerifySignupParams,
    options?: ClientOptions
  ): Promise<AgentVerifySignupResult> {
    const baseUrl = options?.baseUrl || DEFAULT_BASE_URL;
    const transport = new HttpTransport({
      baseUrl,
      apiKey,
      defaultTimeoutMs: options?.timeoutMs,
    });

    return transport.post<AgentVerifySignupResult>("/v1/agent-signup/verify", {
      code: params.verification_code,
      verification_code: params.verification_code,
    });
  }

  // ==========================================================================
  // Identity Management Methods
  // ==========================================================================

  /**
   * Provisions a new Agent Identity with an atomic dedicated inbox.
   */
  async createIdentity(params: CreateIdentityParams): Promise<AgentIdentity> {
    this.ensureAuthenticated();
    const data = await this._http.post<IdentityData>("/v1/identities", params);
    return new AgentIdentity(data, this._http);
  }

  /**
   * Retrieves an Agent Identity by its handle.
   * If handle is omitted, returns the caller's scoped identity or the primary identity.
   */
  async getIdentity(agent_handle?: string): Promise<AgentIdentity> {
    this.ensureAuthenticated();

    if (agent_handle) {
      const data = await this._http.get<IdentityData>(
        `/v1/identities/${encodeURIComponent(agent_handle)}`
      );
      return new AgentIdentity(data, this._http);
    }

    // When handle is omitted:
    // List identities (if identity-scoped key, server returns only this identity)
    const list = await this._http.get<IdentityData[] | { identities: IdentityData[] }>("/v1/identities");
    const identities = Array.isArray(list) ? list : list.identities || [];

    if (identities.length === 0) {
      throw new NotFoundError(404, "identity_not_found", "No agent identities found in this organization.");
    }

    const first = identities[0];
    if (!first) {
      throw new NotFoundError(404, "identity_not_found", "No agent identities found in this organization.");
    }

    return new AgentIdentity(first, this._http);
  }

  /**
   * Lists active agent identities in the organization.
   */
  async listIdentities(params?: ListIdentitiesParams): Promise<ListIdentitiesResult> {
    this.ensureAuthenticated();
    const response = await this._http.get<IdentityData[] | { identities: IdentityData[]; total: number }>(
      "/v1/identities",
      {
        limit: params?.limit,
        offset: params?.offset,
        status: params?.status,
      }
    );

    if (Array.isArray(response)) {
      return {
        identities: response.map((item) => new AgentIdentity(item, this._http)),
        total: response.length,
      };
    }

    return {
      identities: (response.identities || []).map((item) => new AgentIdentity(item, this._http)),
      total: response.total ?? response.identities?.length ?? 0,
    };
  }

  // ==========================================================================
  // Instance Verification & Telemetry
  // ==========================================================================

  /**
   * Verifies this agent's claim status using the client's configured API key.
   */
  async verifySignup(params: AgentVerifySignupParams): Promise<AgentVerifySignupResult> {
    this.ensureAuthenticated();
    return this._http.post<AgentVerifySignupResult>("/v1/agent-signup/verify", {
      code: params.verification_code,
      verification_code: params.verification_code,
    });
  }

  /**
   * Inspects the authenticated caller's identity, organization, claim status, and usage telemetry.
   * Maps to GET /v1/me.
   */
  async whoami(options?: RequestOptions): Promise<WhoamiResult> {
    this.ensureAuthenticated();
    return this._http.get<WhoamiResult>("/v1/me", undefined, options);
  }

  /**
   * Alias for whoami().
   */
  async me(options?: RequestOptions): Promise<WhoamiResult> {
    return this.whoami(options);
  }

  private ensureAuthenticated(): void {
    if (!this._apiKey) {
      throw new AuthenticationError(
        401,
        "missing_api_key",
        "API key is required. Pass apiKey in options, set WIREBOX_API_KEY environment variable, or configure ~/.wirebox/config."
      );
    }
  }
}
