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
