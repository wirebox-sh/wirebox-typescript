/**
 * Wirebox TypeScript SDK - Phone & SMS Client
 *
 * Provides real-world cellular phone number provisioning, release,
 * and inbound SMS/MMS message retrieval with signed media links.
 */

import type { HttpTransport } from "./http.js";
import type {
  ListPhoneMessagesParams,
  ListPhoneMessagesResult,
  ListPhoneNumbersParams,
  ListPhoneNumbersResult,
  PhoneMessage,
  PhoneNumber,
  ProvisionPhoneNumberParams,
  RequestOptions,
  UpdatePhoneMessageParams,
} from "./types.js";

/**
 * Operations on phone numbers.
 */
export class PhoneNumbersClient {
  constructor(private readonly _http: HttpTransport) {}

  /**
   * Provisions a new carrier phone number and binds it to an agent identity.
   *
   * @param params Provisioning options including target agent handle, region, or area code.
   * @param options Optional custom request options.
   */
  async provision(
    params: ProvisionPhoneNumberParams,
    options?: RequestOptions
  ): Promise<PhoneNumber> {
    const handle = params.agent_handle.startsWith("@")
      ? params.agent_handle.slice(1)
      : params.agent_handle;

    const body: Record<string, unknown> = {
      agent_handle: handle,
    };
    if (params.country_code) body.country_code = params.country_code;
    if (params.type) body.type = params.type;
    if (params.region) body.region = params.region;
    if (params.area_code) body.area_code = params.area_code;

    return this._http.post<PhoneNumber>("/v1/phone/numbers", body, options);
  }

  /**
   * Lists active phone numbers in the organization.
   *
   * @param params Optional pagination and status filters.
   * @param options Optional custom request options.
   */
  async list(
    params?: ListPhoneNumbersParams,
    options?: RequestOptions
  ): Promise<ListPhoneNumbersResult> {
    const query: Record<string, string | number | undefined> = {};
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.cursor) query.cursor = params.cursor;
    if (params?.status) query.status = params.status;
    if (params?.sms_status) query.sms_status = params.sms_status;

    return this._http.get<ListPhoneNumbersResult>("/v1/phone/numbers", query, options);
  }

  /**
   * Retrieves details of a specific phone number.
   *
   * @param number Phone number identifier: accepts a `pn_...` ID, E.164 number (`+1...`), or agent handle (`@handle`).
   * @param options Optional custom request options.
   */
  async get(number: string, options?: RequestOptions): Promise<PhoneNumber> {
    const cleanNumber = number.startsWith("@") ? number.slice(1) : number;
    return this._http.get<PhoneNumber>(
      `/v1/phone/numbers/${encodeURIComponent(cleanNumber)}`,
      undefined,
      options
    );
  }

  /**
   * Releases a phone number back to the carrier. The owning agent identity survives.
   *
   * @param number Phone number identifier: accepts a `pn_...` ID, E.164 number (`+1...`), or agent handle (`@handle`).
   * @param options Optional custom request options.
   */
  async release(number: string, options?: RequestOptions): Promise<void> {
    const cleanNumber = number.startsWith("@") ? number.slice(1) : number;
    await this._http.delete<void>(
      `/v1/phone/numbers/${encodeURIComponent(cleanNumber)}`,
      options
    );
  }
}

/**
 * Operations on SMS and MMS messages received on phone numbers.
 */
export class PhoneMessagesClient {
  constructor(private readonly _http: HttpTransport) {}

  /**
   * Lists SMS/MMS messages received on a phone number, newest first.
   *
   * @param number Phone number identifier: accepts a `pn_...` ID, E.164 number (`+1...`), or agent handle (`@handle`).
   * @param params Filter and pagination options.
   * @param options Optional custom request options.
   */
  async list(
    number: string,
    params?: ListPhoneMessagesParams,
    options?: RequestOptions
  ): Promise<ListPhoneMessagesResult> {
    const cleanNumber = number.startsWith("@") ? number.slice(1) : number;
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.cursor) query.cursor = params.cursor;
    if (params?.is_read !== undefined) query.is_read = params.is_read;
    if (params?.from_number) query.from_number = params.from_number;

    return this._http.get<ListPhoneMessagesResult>(
      `/v1/phone/numbers/${encodeURIComponent(cleanNumber)}/messages`,
      query,
      options
    );
  }

  /**
   * Retrieves a single SMS/MMS message by ID.
   *
   * @param number Phone number identifier: accepts a `pn_...` ID, E.164 number (`+1...`), or agent handle (`@handle`).
   * @param messageId Unique message ID (e.g. `msg_...`).
   * @param options Optional custom request options.
   */
  async get(
    number: string,
    messageId: string,
    options?: RequestOptions
  ): Promise<PhoneMessage> {
    const cleanNumber = number.startsWith("@") ? number.slice(1) : number;
    return this._http.get<PhoneMessage>(
      `/v1/phone/numbers/${encodeURIComponent(cleanNumber)}/messages/${encodeURIComponent(messageId)}`,
      undefined,
      options
    );
  }

  /**
   * Updates message attributes (e.g. marking as read/unread).
   *
   * @param number Phone number identifier: accepts a `pn_...` ID, E.164 number (`+1...`), or agent handle (`@handle`).
   * @param messageId Unique message ID (e.g. `msg_...`).
   * @param params Update payload containing `is_read`.
   * @param options Optional custom request options.
   */
  async update(
    number: string,
    messageId: string,
    params: UpdatePhoneMessageParams,
    options?: RequestOptions
  ): Promise<PhoneMessage> {
    const cleanNumber = number.startsWith("@") ? number.slice(1) : number;
    return this._http.patch<PhoneMessage>(
      `/v1/phone/numbers/${encodeURIComponent(cleanNumber)}/messages/${encodeURIComponent(messageId)}`,
      params,
      options
    );
  }

  /**
   * Convenience helper to mark a message as read.
   *
   * @param number Phone number identifier: accepts a `pn_...` ID, E.164 number (`+1...`), or agent handle (`@handle`).
   * @param messageId Unique message ID (e.g. `msg_...`).
   * @param options Optional custom request options.
   */
  async markRead(
    number: string,
    messageId: string,
    options?: RequestOptions
  ): Promise<PhoneMessage> {
    return this.update(number, messageId, { is_read: true }, options);
  }
}

/**
 * Top-level client for cellular phone numbers and SMS/MMS messaging.
 */
export class PhoneClient {
  readonly numbers: PhoneNumbersClient;
  readonly messages: PhoneMessagesClient;

  constructor(http: HttpTransport) {
    this.numbers = new PhoneNumbersClient(http);
    this.messages = new PhoneMessagesClient(http);
  }
}
