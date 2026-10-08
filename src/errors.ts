/**
 * Wirebox TypeScript SDK - Error Hierarchy
 *
 * Provides strongly-typed error classes mapped to HTTP status codes and Wirebox error codes.
 */

export class WireboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireboxError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WireboxConnectionError extends WireboxError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WireboxConnectionError";
    this.cause = cause;
  }
}

export class WireboxAPIError extends WireboxError {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly rawResponse?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    rawResponse?: unknown
  ) {
    super(message);
    this.name = "WireboxAPIError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.rawResponse = rawResponse;
  }
}

export class AuthenticationError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "AuthenticationError";
  }
}

export class PermissionDeniedError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "PermissionDeniedError";
  }
}

export class NotFoundError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "NotFoundError";
  }
}

export class AgentNotFoundError extends NotFoundError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "AgentNotFoundError";
  }
}

export class MailboxNotFoundError extends NotFoundError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "MailboxNotFoundError";
  }
}

export class ValidationError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "ValidationError";
  }
}

export class HandleAlreadyTakenError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "HandleAlreadyTakenError";
  }
}

export class AlreadyVerifiedError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "AlreadyVerifiedError";
  }
}

export class RateLimitError extends WireboxAPIError {
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    raw?: unknown,
    retryAfterSeconds?: number
  ) {
    super(status, code, message, requestId, raw);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class FreeTierLimitExceededError extends RateLimitError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "FreeTierLimitExceededError";
  }
}

export class InvalidVerificationCodeError extends ValidationError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "InvalidVerificationCodeError";
  }
}

export class VerificationCodeExpiredError extends ValidationError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "VerificationCodeExpiredError";
  }
}

// ---------------------------------------------------------------------------
// Vault errors
// ---------------------------------------------------------------------------

/** The organization has no vault yet; call `vault.initialize()` first. */
export class VaultNotInitializedError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "VaultNotInitializedError";
  }
}

/** A vault already exists for this organization. */
export class VaultAlreadyInitializedError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "VaultAlreadyInitializedError";
  }
}

/** The vault key did not match: unlock failed (server 401) or local decryption failed. */
export class InvalidVaultKeyError extends WireboxAPIError {
  constructor(status: number, code: string, message: string, requestId?: string, raw?: unknown) {
    super(status, code, message, requestId, raw);
    this.name = "InvalidVaultKeyError";
  }
}

/** A secret id was not present in the unlocked vault. */
export class VaultSecretNotFoundError extends WireboxError {
  constructor(message: string) {
    super(message);
    this.name = "VaultSecretNotFoundError";
  }
}

/** A typed getter was used for a secret of a different type. */
export class VaultSecretTypeError extends WireboxError {
  constructor(message: string) {
    super(message);
    this.name = "VaultSecretTypeError";
  }
}

/**
 * Parses raw API error responses and maps them to appropriate WireboxAPIError subclasses.
 */
export function parseApiError(
  status: number,
  body: any,
  requestId?: string
): WireboxAPIError {
  const errorObj = body?.error || body;
  const code: string = errorObj?.code || `HTTP_${status}`;
  const message: string =
    errorObj?.message ||
    (typeof body === "string" ? body : `Request failed with status ${status}`);

  switch (code) {
    case "handle_already_taken":
      return new HandleAlreadyTakenError(status, code, message, requestId, body);
    case "already_verified":
      return new AlreadyVerifiedError(status, code, message, requestId, body);
    case "agent_not_found":
      return new AgentNotFoundError(status, code, message, requestId, body);
    case "mailbox_not_found":
      return new MailboxNotFoundError(status, code, message, requestId, body);
    case "free_tier_limit_exceeded":
      return new FreeTierLimitExceededError(status, code, message, requestId, body);
    case "rate_limit_exceeded":
      return new RateLimitError(status, code, message, requestId, body);
    case "invalid_verification_code":
      return new InvalidVerificationCodeError(status, code, message, requestId, body);
    case "verification_code_expired":
      return new VerificationCodeExpiredError(status, code, message, requestId, body);
    case "vault_not_initialized":
      return new VaultNotInitializedError(status, code, message, requestId, body);
    case "vault_already_initialized":
      return new VaultAlreadyInitializedError(status, code, message, requestId, body);
    case "invalid_vault_key":
      return new InvalidVaultKeyError(status, code, message, requestId, body);
    default:
      break;
  }

  if (status === 401) {
    return new AuthenticationError(status, code, message, requestId, body);
  }
  if (status === 403) {
    return new PermissionDeniedError(status, code, message, requestId, body);
  }
  if (status === 404) {
    return new NotFoundError(status, code, message, requestId, body);
  }
  if (status === 400 || status === 422) {
    return new ValidationError(status, code, message, requestId, body);
  }
  if (status === 429) {
    return new RateLimitError(status, code, message, requestId, body);
  }

  return new WireboxAPIError(status, code, message, requestId, body);
}
