/**
 * Wirebox TypeScript SDK - Tunnels Client
 *
 * Provides control-plane tunnel queries/updates and data-plane local reverse-proxy connections.
 */

import type { HttpTransport } from "./http.js";
import { AuthenticationError, ValidationError, WireboxError } from "./errors.js";
import type {
  ListTunnelsParams,
  Tunnel,
  TunnelConnectOptions,
  TunnelRequestEvent,
  TunnelSession,
  UpdateTunnelParams,
} from "./types.js";

// ============================================================================
// Envelopes & Types
// ============================================================================

interface InboundHttpRequestMessage {
  type: "http_request";
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null; // base64
}

interface OutboundHttpResponseMessage {
  type: "http_response";
  id: string;
  status: number;
  headers: Record<string, string>;
  body: string | null; // base64
}

interface OutboundHttpErrorMessage {
  type: "http_error";
  id: string;
  error: string;
}

/**
 * Resolves the WebSocket constructor for the current environment.
 */
function resolveWebSocketConstructor(customWs?: any): any {
  if (customWs) return customWs;
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  try {
    // Dynamic fallback for older Node environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const wsPkg = require("ws");
    return wsPkg.WebSocket || wsPkg;
  } catch {
    throw new WireboxError(
      "No global WebSocket implementation available. Please pass a WebSocket constructor in options.WebSocket or run on Node 21+."
    );
  }
}

/**
 * Normalizes an agent handle or tunnel ID (strips leading '@')
 */
function normalizeIdentifier(raw: string): string {
  let val = raw.trim();
  if (val.startsWith("@")) {
    val = val.slice(1);
  }
  return val.toLowerCase();
}

/**
 * Normalizes forward-to target into a valid HTTP origin
 */
function normalizeForwardTo(target?: string | number): string {
  if (target === undefined || target === null || target === "") {
    return "http://localhost:3000";
  }
  if (typeof target === "number" || /^\d+$/.test(String(target).trim())) {
    return `http://127.0.0.1:${target}`;
  }
  let str = String(target).trim();
  if (!/^https?:\/\//i.test(str)) {
    str = `http://${str}`;
  }
  return str.replace(/\/+$/, "");
}

/**
 * Converts a Base64 string to an ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts an ArrayBuffer to a Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// ============================================================================
// Tunnels Client Implementation
// ============================================================================

export class TunnelsClient {
  private readonly _http: HttpTransport;
  private readonly _apiKey?: string;
  private readonly _baseUrl: string;

  constructor(http: HttpTransport, apiKey?: string, baseUrl: string = "https://api.wirebox.sh") {
    this._http = http;
    this._apiKey = apiKey;
    this._baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * Lists all agent network tunnels in the organization.
   */
  async list(params?: ListTunnelsParams): Promise<Tunnel[]> {
    const query = new URLSearchParams();
    if (params?.is_connected !== undefined) {
      query.set("is_connected", String(params.is_connected));
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (params?.limit) {
      query.set("limit", String(params.limit));
    }

    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await this._http.get<{ tunnels: Tunnel[] }>(`/v1/tunnels${qs}`);
    return res.tunnels;
  }

  /**
   * Retrieves full details and live connection telemetry for a single tunnel.
   * Accepts either a tunnel ID (e.g. 'tun_01J...') or an agent handle (e.g. 'sales-bot' or '@sales-bot').
   */
  async get(idOrHandle: string): Promise<Tunnel> {
    const identifier = normalizeIdentifier(idOrHandle);
    return this._http.get<Tunnel>(`/v1/tunnels/${encodeURIComponent(identifier)}`);
  }

  /**
   * Updates administrative status ('active' | 'disabled') for a tunnel.
   */
  async update(idOrHandle: string, params: UpdateTunnelParams): Promise<Tunnel> {
    const identifier = normalizeIdentifier(idOrHandle);
    return this._http.patch<Tunnel>(`/v1/tunnels/${encodeURIComponent(identifier)}`, params);
  }

  /**
   * Establishes a live reverse-proxy tunnel session connecting a local service or
   * in-memory fetch handler to the agent's public URL (https://{handle}.wirebox.run).
   *
   * @param idOrHandle - The agent handle or tunnel ID
   * @param options - Port forwarding, custom handler, or logging callbacks
   */
  async connect(idOrHandle: string, options: TunnelConnectOptions = {}): Promise<TunnelSession> {
    const identifier = normalizeIdentifier(idOrHandle);
    const forwardTo = normalizeForwardTo(options.forwardTo);
    const clientVersion = options.clientVersion || "wirebox-sdk/0.1.0";
    const WSConstructor = resolveWebSocketConstructor(options.WebSocket);

    if (!this._apiKey) {
      throw new AuthenticationError(
        401,
        "authentication_error",
        "An API key is required to connect a tunnel. Pass apiKey to Wirebox constructor or set WIREBOX_API_KEY."
      );
    }

    // 1. Fetch tunnel info to obtain public URL and verify status
    const tunnel = await this.get(identifier);
    if (tunnel.status === "disabled") {
      throw new ValidationError(
        403,
        "tunnel_disabled",
        `Tunnel for '@${tunnel.agent_handle}' is administratively disabled.`
      );
    }

    // 2. Form WebSocket endpoint URL
    const wsProto = this._baseUrl.startsWith("https") ? "wss" : "ws";
    const hostAndPath = this._baseUrl.replace(/^https?:\/\//, "");
    const wsUrl = new URL(`${wsProto}://${hostAndPath}/v1/tunnels/${encodeURIComponent(tunnel.agent_handle)}/connect`);
    wsUrl.searchParams.set("forward_to", forwardTo);
    wsUrl.searchParams.set("api_key", this._apiKey);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._apiKey}`,
      "X-Forward-To": forwardTo,
      "X-Client-Version": clientVersion,
    };

    let ws: any;
    try {
      // Support environments that take headers in WebSocket constructor options
      ws = new WSConstructor(wsUrl.toString(), { headers });
    } catch {
      // Fallback for browsers or runtimes where second argument only allows subprotocols
      ws = new WSConstructor(wsUrl.toString());
    }

    let isConnected = false;
    let closedExplicitly = false;
    let resolveClosed: () => void;
    const waitClosedPromise = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });

    const session: TunnelSession = {
      publicUrl: tunnel.public_url,
      publicHost: tunnel.public_host,
      agentHandle: tunnel.agent_handle,
      get isConnected() {
        return isConnected;
      },
      async close(): Promise<void> {
        closedExplicitly = true;
        try {
          ws.close(1000, "Client closed connection");
        } catch {}
      },
      async waitClosed(): Promise<void> {
        return waitClosedPromise;
      },
    };

    // Await initial handshake
    await new Promise<void>((resolve, reject) => {
      let resolved = false;

      const onOpen = () => {
        if (!resolved) {
          resolved = true;
          isConnected = true;
          options.onStatusChange?.({ connected: true });
          resolve();
        }
      };

      const onError = (err: any) => {
        if (!resolved) {
          resolved = true;
          reject(new WireboxError(`Failed to establish tunnel connection: ${err?.message || "connection error"}`));
        } else {
          options.onStatusChange?.({ connected: false, error: err?.message || "WebSocket error" });
        }
      };

      const onClose = (event: any) => {
        isConnected = false;
        if (!resolved) {
          resolved = true;
          const code = event?.code || 1006;
          const reason = event?.reason || "Closed before handshake";
          reject(new WireboxError(`Tunnel handshake failed with code ${code}: ${reason}`));
        } else {
          if (!closedExplicitly) {
            options.onStatusChange?.({ connected: false, error: event?.reason });
          }
          resolveClosed();
        }
      };

      if (typeof ws.addEventListener === "function") {
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
        ws.addEventListener("close", onClose);
      } else {
        ws.onopen = onOpen;
        ws.onerror = onError;
        ws.onclose = onClose;
      }
    });

    // 3. Setup Incoming HTTP Request Dispatcher
    const onMessage = async (event: any) => {
      const rawData = typeof event.data === "string" ? event.data : event.data?.toString?.();
      if (!rawData) return;

      let msg: InboundHttpRequestMessage;
      try {
        msg = JSON.parse(rawData);
      } catch {
        return;
      }

      if (msg.type !== "http_request") {
        return;
      }

      const startTime = Date.now();

      // Dispatch request to either in-memory handler or local port forwarder
      try {
        let responseStatus = 200;
        let responseHeaders: Record<string, string> = {};
        let responseBase64: string | null = null;

        if (options.handler) {
          // In-Memory Fetch Handler
          const targetUrl = `https://${tunnel.public_host}${msg.path}`;
          let reqBody: ArrayBuffer | undefined;
          if (msg.body) {
            reqBody = base64ToArrayBuffer(msg.body);
          }

          const request = new Request(targetUrl, {
            method: msg.method,
            headers: msg.headers,
            body: msg.method !== "GET" && msg.method !== "HEAD" ? reqBody : undefined,
          });

          const res = await options.handler(request);
          responseStatus = res.status;
          res.headers.forEach((val, key) => {
            responseHeaders[key.toLowerCase()] = val;
          });

          const resBuffer = await res.arrayBuffer();
          if (resBuffer.byteLength > 0) {
            responseBase64 = arrayBufferToBase64(resBuffer);
          }
        } else {
          // Local Port / URL Forwarding
          const localUrl = `${forwardTo}${msg.path}`;
          let localBody: ArrayBuffer | undefined;
          if (msg.body) {
            localBody = base64ToArrayBuffer(msg.body);
          }

          const localRes = await fetch(localUrl, {
            method: msg.method,
            headers: msg.headers,
            body: msg.method !== "GET" && msg.method !== "HEAD" ? localBody : undefined,
          });

          responseStatus = localRes.status;
          localRes.headers.forEach((val, key) => {
            responseHeaders[key.toLowerCase()] = val;
          });

          const localBuffer = await localRes.arrayBuffer();
          if (localBuffer.byteLength > 0) {
            responseBase64 = arrayBufferToBase64(localBuffer);
          }
        }

        const reply: OutboundHttpResponseMessage = {
          type: "http_response",
          id: msg.id,
          status: responseStatus,
          headers: responseHeaders,
          body: responseBase64,
        };

        ws.send(JSON.stringify(reply));

        const durationMs = Date.now() - startTime;
        const requestEvent: TunnelRequestEvent = {
          id: msg.id,
          method: msg.method,
          path: msg.path,
          status: responseStatus,
          durationMs,
        };
        options.onRequest?.(requestEvent);
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const errMsg = err?.message || "Failed to forward request to local destination";

        const errReply: OutboundHttpErrorMessage = {
          type: "http_error",
          id: msg.id,
          error: errMsg,
        };

        try {
          ws.send(JSON.stringify(errReply));
        } catch {}

        const requestEvent: TunnelRequestEvent = {
          id: msg.id,
          method: msg.method,
          path: msg.path,
          status: 502,
          durationMs,
          error: errMsg,
        };
        options.onRequest?.(requestEvent);
      }
    };

    if (typeof ws.addEventListener === "function") {
      ws.addEventListener("message", onMessage);
    } else {
      ws.onmessage = onMessage;
    }

    return session;
  }
}
