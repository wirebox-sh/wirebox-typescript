/**
 * Wirebox TypeScript SDK - Mail Rules & Security Guardrails Client
 *
 * Provides granular inbound prompt-injection defense and outbound data-exfiltration
 * defense by managing allowlist/blocklist rules scoped to an agent identity.
 */

import type { HttpTransport } from "./http.js";
import type {
  CreateMailRuleParams,
  DeleteMailRuleResult,
  ListMailRulesParams,
  ListMailRulesResult,
  MailPolicy,
  MailRule,
  MailRuleDirection,
  RequestOptions,
  SetMailPolicyParams,
  UpdateMailRuleParams,
} from "./types.js";

function cleanHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, "");
}

function parsePolicy(data: {
  mail_inbound_filter_mode?: string;
  mail_outbound_filter_mode?: string;
  mail_filter_mode?: string;
}): MailPolicy {
  const inMode = data.mail_inbound_filter_mode || data.mail_filter_mode;
  const outMode = data.mail_outbound_filter_mode || data.mail_filter_mode;
  return {
    inbound: inMode === "whitelist" ? "protected" : "open",
    outbound: outMode === "whitelist" ? "restricted" : "open",
  };
}

function resolveModes(policy: SetMailPolicyParams) {
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
  return { targetInbound, targetOutbound };
}

export interface AllowBlockOptions {
  direction?: MailRuleDirection;
  reason?: string;
  requestOptions?: RequestOptions;
}

/**
 * Top-level Mail Rules client, operating across any agent handle.
 */
export class MailRulesClient {
  constructor(private readonly _http: HttpTransport) {}

  /**
   * Lists mail rules for a given agent identity.
   *
   * @param agentHandle Unique handle of the agent (leading '@' is optional).
   * @param params Optional filtering (direction, action) and pagination parameters.
   * @param options Optional custom request options.
   */
  async list(
    agentHandle: string,
    params?: ListMailRulesParams,
    options?: RequestOptions
  ): Promise<ListMailRulesResult> {
    const handle = cleanHandle(agentHandle);
    const query: Record<string, string | number | undefined> = {};
    if (params?.direction) query.direction = params.direction;
    if (params?.action) query.action = params.action;
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.offset !== undefined) query.offset = params.offset;

    return this._http.get<ListMailRulesResult>(
      `/v1/identities/${encodeURIComponent(handle)}/mail-rules`,
      query,
      options
    );
  }

  /**
   * Retrieves a single mail rule by its ID.
   *
   * @param agentHandle Unique handle of the agent.
   * @param ruleId Rule identifier (e.g. "mrl_01J8ABC123DEF456").
   * @param options Optional custom request options.
   */
  async get(
    agentHandle: string,
    ruleId: string,
    options?: RequestOptions
  ): Promise<MailRule> {
    const handle = cleanHandle(agentHandle);
    return this._http.get<MailRule>(
      `/v1/identities/${encodeURIComponent(handle)}/mail-rules/${encodeURIComponent(ruleId)}`,
      undefined,
      options
    );
  }

  /**
   * Creates a new mail rule for an agent identity.
   *
   * @param agentHandle Unique handle of the agent.
   * @param params Rule definition including entry, direction, and action.
   * @param options Optional custom request options.
   */
  async create(
    agentHandle: string,
    params: CreateMailRuleParams,
    options?: RequestOptions
  ): Promise<MailRule> {
    const handle = cleanHandle(agentHandle);
    return this._http.post<MailRule>(
      `/v1/identities/${encodeURIComponent(handle)}/mail-rules`,
      {
        entry: params.entry,
        direction: params.direction || "both",
        action: params.action || "allow",
        reason: params.reason,
      },
      options
    );
  }

  /**
   * Ergonomic helper: allows an email address or domain for an agent identity.
   *
   * @param agentHandle Unique handle of the agent.
   * @param entry Email address (e.g. "alice@company.com") or domain ("@company.com").
   * @param opts Optional direction ('inbound' | 'outbound' | 'both'), reason, or request options.
   */
  async allow(
    agentHandle: string,
    entry: string,
    opts?: AllowBlockOptions
  ): Promise<MailRule> {
    return this.create(
      agentHandle,
      {
        entry,
        action: "allow",
        direction: opts?.direction || "both",
        reason: opts?.reason,
      },
      opts?.requestOptions
    );
  }

  /**
   * Ergonomic helper: blocks an email address or domain for an agent identity.
   *
   * @param agentHandle Unique handle of the agent.
   * @param entry Email address or domain pattern to block.
   * @param opts Optional direction ('inbound' | 'outbound' | 'both'), reason, or request options.
   */
  async block(
    agentHandle: string,
    entry: string,
    opts?: AllowBlockOptions
  ): Promise<MailRule> {
    return this.create(
      agentHandle,
      {
        entry,
        action: "block",
        direction: opts?.direction || "both",
        reason: opts?.reason,
      },
      opts?.requestOptions
    );
  }

  /**
   * Updates an existing mail rule (e.g. change action, toggle status active/paused, update reason).
   *
   * @param agentHandle Unique handle of the agent.
   * @param ruleId Rule identifier.
   * @param params Updated attributes.
   * @param options Optional custom request options.
   */
  async update(
    agentHandle: string,
    ruleId: string,
    params: UpdateMailRuleParams,
    options?: RequestOptions
  ): Promise<MailRule> {
    const handle = cleanHandle(agentHandle);
    return this._http.patch<MailRule>(
      `/v1/identities/${encodeURIComponent(handle)}/mail-rules/${encodeURIComponent(ruleId)}`,
      params,
      options
    );
  }

  /**
   * Deletes a mail rule by ID.
   *
   * @param agentHandle Unique handle of the agent.
   * @param ruleId Rule identifier.
   * @param options Optional custom request options.
   */
  async delete(
    agentHandle: string,
    ruleId: string,
    options?: RequestOptions
  ): Promise<DeleteMailRuleResult> {
    const handle = cleanHandle(agentHandle);
    return this._http.delete<DeleteMailRuleResult>(
      `/v1/identities/${encodeURIComponent(handle)}/mail-rules/${encodeURIComponent(ruleId)}`,
      options
    );
  }

  /**
   * Retrieves the current inbound and outbound mail security policy for an agent.
   *
   * @param agentHandle Unique handle of the agent.
   * @param options Optional custom request options.
   * @returns Current MailPolicy ({ inbound: 'protected' | 'open', outbound: 'restricted' | 'open' }).
   */
  async getPolicy(
    agentHandle: string,
    options?: RequestOptions
  ): Promise<MailPolicy> {
    const handle = cleanHandle(agentHandle);
    const data = await this._http.get<{
      mail_inbound_filter_mode?: string;
      mail_outbound_filter_mode?: string;
      mail_filter_mode?: string;
    }>(`/v1/identities/${encodeURIComponent(handle)}`, undefined, options);
    return parsePolicy(data);
  }

  /**
   * Configures the inbound and outbound mail security policy for an agent.
   *
   * @example
   * ```ts
   * await client.mailRules.setPolicy("sales-bot", {
   *   inbound: "protected",
   *   outbound: "restricted"
   * });
   * ```
   *
   * @param agentHandle Unique handle of the agent.
   * @param policy Inbound ('protected' | 'open') and outbound ('restricted' | 'open') postures.
   * @param options Optional custom request options.
   * @returns Updated MailPolicy.
   */
  async setPolicy(
    agentHandle: string,
    policy: SetMailPolicyParams,
    options?: RequestOptions
  ): Promise<MailPolicy> {
    const handle = cleanHandle(agentHandle);
    const { targetInbound, targetOutbound } = resolveModes(policy);
    const data = await this._http.patch<{
      mail_inbound_filter_mode?: string;
      mail_outbound_filter_mode?: string;
      mail_filter_mode?: string;
    }>(
      `/v1/identities/${encodeURIComponent(handle)}`,
      {
        mail_inbound_filter_mode: targetInbound,
        mail_outbound_filter_mode: targetOutbound,
      },
      options
    );
    return parsePolicy(data);
  }
}

/**
 * Identity-bound Mail Rules client, operating directly on an AgentIdentity instance.
 */
export class IdentityMailRulesClient {
  constructor(
    private readonly _http: HttpTransport,
    private readonly _agentHandle: string
  ) {}

  /**
   * Lists mail rules for this agent identity.
   */
  async list(
    params?: ListMailRulesParams,
    options?: RequestOptions
  ): Promise<ListMailRulesResult> {
    const query: Record<string, string | number | undefined> = {};
    if (params?.direction) query.direction = params.direction;
    if (params?.action) query.action = params.action;
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.offset !== undefined) query.offset = params.offset;

    return this._http.get<ListMailRulesResult>(
      `/v1/identities/${encodeURIComponent(this._agentHandle)}/mail-rules`,
      query,
      options
    );
  }

  /**
   * Retrieves a single mail rule by its ID.
   */
  async get(ruleId: string, options?: RequestOptions): Promise<MailRule> {
    return this._http.get<MailRule>(
      `/v1/identities/${encodeURIComponent(this._agentHandle)}/mail-rules/${encodeURIComponent(ruleId)}`,
      undefined,
      options
    );
  }

  /**
   * Creates a new mail rule for this agent identity.
   */
  async create(
    params: CreateMailRuleParams,
    options?: RequestOptions
  ): Promise<MailRule> {
    return this._http.post<MailRule>(
      `/v1/identities/${encodeURIComponent(this._agentHandle)}/mail-rules`,
      {
        entry: params.entry,
        direction: params.direction || "both",
        action: params.action || "allow",
        reason: params.reason,
      },
      options
    );
  }

  /**
   * Ergonomic helper: allows an email address or domain for this agent identity.
   */
  async allow(entry: string, opts?: AllowBlockOptions): Promise<MailRule> {
    return this.create(
      {
        entry,
        action: "allow",
        direction: opts?.direction || "both",
        reason: opts?.reason,
      },
      opts?.requestOptions
    );
  }

  /**
   * Ergonomic helper: blocks an email address or domain for this agent identity.
   */
  async block(entry: string, opts?: AllowBlockOptions): Promise<MailRule> {
    return this.create(
      {
        entry,
        action: "block",
        direction: opts?.direction || "both",
        reason: opts?.reason,
      },
      opts?.requestOptions
    );
  }

  /**
   * Updates an existing mail rule.
   */
  async update(
    ruleId: string,
    params: UpdateMailRuleParams,
    options?: RequestOptions
  ): Promise<MailRule> {
    return this._http.patch<MailRule>(
      `/v1/identities/${encodeURIComponent(this._agentHandle)}/mail-rules/${encodeURIComponent(ruleId)}`,
      params,
      options
    );
  }

  /**
   * Deletes a mail rule by ID.
   */
  async delete(
    ruleId: string,
    options?: RequestOptions
  ): Promise<DeleteMailRuleResult> {
    return this._http.delete<DeleteMailRuleResult>(
      `/v1/identities/${encodeURIComponent(this._agentHandle)}/mail-rules/${encodeURIComponent(ruleId)}`,
      options
    );
  }

  /**
   * Retrieves the current mail security policy for this agent identity.
   */
  async getPolicy(options?: RequestOptions): Promise<MailPolicy> {
    const data = await this._http.get<{
      mail_inbound_filter_mode?: string;
      mail_outbound_filter_mode?: string;
      mail_filter_mode?: string;
    }>(`/v1/identities/${encodeURIComponent(this._agentHandle)}`, undefined, options);
    return parsePolicy(data);
  }

  /**
   * Configures the mail security policy for this agent identity.
   */
  async setPolicy(
    policy: SetMailPolicyParams,
    options?: RequestOptions
  ): Promise<MailPolicy> {
    const { targetInbound, targetOutbound } = resolveModes(policy);
    const data = await this._http.patch<{
      mail_inbound_filter_mode?: string;
      mail_outbound_filter_mode?: string;
      mail_filter_mode?: string;
    }>(
      `/v1/identities/${encodeURIComponent(this._agentHandle)}`,
      {
        mail_inbound_filter_mode: targetInbound,
        mail_outbound_filter_mode: targetOutbound,
      },
      options
    );
    return parsePolicy(data);
  }
}
