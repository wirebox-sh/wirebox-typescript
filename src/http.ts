/**
 * Wirebox TypeScript SDK - Zero-Dependency HTTP Client
 */

import { WireboxConnectionError, parseApiError } from "./errors.js";
import type { RequestOptions } from "./types.js";

export interface HttpTransportOptions {
  baseUrl: string;
  apiKey?: string;
  defaultTimeoutMs?: number;
}

export class HttpTransport {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
  }

  get currentBaseUrl(): string {
    return this.baseUrl;
  }

  get currentApiKey(): string | undefined {
    return this.apiKey;
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions & { query?: Record<string, string | number | boolean | undefined | null> }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);

    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const effectiveApiKey = options?.apiKey ?? this.apiKey;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "@wirebox-sh/sdk/0.1.0",
      ...options?.headers,
    };

    if (effectiveApiKey) {
      headers["Authorization"] = `Bearer ${effectiveApiKey}`;
    }

    if (body !== undefined && body !== null && method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined && body !== null && method !== "GET" ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const requestId =
        response.headers.get("x-wirebox-request-id") ||
        response.headers.get("x-request-id") ||
        undefined;

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as unknown as T;
      }

      let responseData: any;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          responseData = await response.json();
        } catch {
          responseData = null;
        }
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        throw parseApiError(response.status, responseData, requestId);
      }

      return responseData as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new WireboxConnectionError(`Request timed out after ${timeoutMs}ms`, err);
      }
      if (err && (err as any).name === "WireboxAPIError" || (err as any) instanceof Error && (err as any).name.endsWith("Error") && (err as any).status) {
        throw err;
      }
      if (err instanceof Error) {
        throw new WireboxConnectionError(err.message, err);
      }
      throw new WireboxConnectionError(String(err));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, { ...options, query });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }
}
