import { describe, it, expect } from "vitest";
import {
  WireboxError,
  WireboxConnectionError,
  WireboxAPIError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  AgentNotFoundError,
  MailboxNotFoundError,
  HandleAlreadyTakenError,
  AlreadyVerifiedError,
  RateLimitError,
  FreeTierLimitExceededError,
  InvalidVerificationCodeError,
  VerificationCodeExpiredError,
  ValidationError,
  parseApiError,
} from "../src/errors.js";

describe("Error Hierarchy", () => {
  it("all custom errors inherit from WireboxError", () => {
    expect(new WireboxConnectionError("net error") instanceof WireboxError).toBe(true);
    expect(new WireboxAPIError(500, "internal_error", "failed") instanceof WireboxError).toBe(true);
    expect(new AuthenticationError(401, "unauthorized", "unauth") instanceof WireboxAPIError).toBe(true);
    expect(new AgentNotFoundError(404, "agent_not_found", "not found") instanceof NotFoundError).toBe(true);
  });

  it("parseApiError maps handle_already_taken to HandleAlreadyTakenError", () => {
    const err = parseApiError(409, { error: { code: "handle_already_taken", message: "Taken!" } });
    expect(err instanceof HandleAlreadyTakenError).toBe(true);
    expect(err.code).toBe("handle_already_taken");
    expect(err.message).toBe("Taken!");
    expect(err.status).toBe(409);
  });

  it("parseApiError maps already_verified to AlreadyVerifiedError", () => {
    const err = parseApiError(409, { error: { code: "already_verified", message: "Already claimed" } });
    expect(err instanceof AlreadyVerifiedError).toBe(true);
  });

  it("parseApiError maps agent_not_found to AgentNotFoundError", () => {
    const err = parseApiError(404, { error: { code: "agent_not_found", message: "Agent missing" } });
    expect(err instanceof AgentNotFoundError).toBe(true);
  });

  it("parseApiError maps mailbox_not_found to MailboxNotFoundError", () => {
    const err = parseApiError(404, { error: { code: "mailbox_not_found", message: "Mailbox missing" } });
    expect(err instanceof MailboxNotFoundError).toBe(true);
  });

  it("parseApiError maps free_tier_limit_exceeded to FreeTierLimitExceededError", () => {
    const err = parseApiError(429, { error: { code: "free_tier_limit_exceeded", message: "Quota reached" } });
    expect(err instanceof FreeTierLimitExceededError).toBe(true);
  });

  it("parseApiError maps invalid_verification_code to InvalidVerificationCodeError", () => {
    const err = parseApiError(400, { error: { code: "invalid_verification_code", message: "Wrong code" } });
    expect(err instanceof InvalidVerificationCodeError).toBe(true);
  });

  it("parseApiError maps verification_code_expired to VerificationCodeExpiredError", () => {
    const err = parseApiError(400, { error: { code: "verification_code_expired", message: "Expired" } });
    expect(err instanceof VerificationCodeExpiredError).toBe(true);
  });

  it("parseApiError maps generic 401 to AuthenticationError", () => {
    const err = parseApiError(401, { error: { code: "unauthorized", message: "Invalid key" } });
    expect(err instanceof AuthenticationError).toBe(true);
  });

  it("parseApiError maps generic 403 to PermissionDeniedError", () => {
    const err = parseApiError(403, { error: { code: "forbidden", message: "Forbidden" } });
    expect(err instanceof PermissionDeniedError).toBe(true);
  });

  it("parseApiError maps generic 429 to RateLimitError", () => {
    const err = parseApiError(429, { error: { code: "rate_limited", message: "Calm down" } });
    expect(err instanceof RateLimitError).toBe(true);
  });

  it("parseApiError maps generic 400 to ValidationError", () => {
    const err = parseApiError(400, { error: { code: "invalid_request", message: "Bad params" } });
    expect(err instanceof ValidationError).toBe(true);
  });

  it("extracts requestId when provided", () => {
    const err = parseApiError(500, { error: { code: "internal", message: "Oops" } }, "req_12345");
    expect(err.requestId).toBe("req_12345");
  });
});
