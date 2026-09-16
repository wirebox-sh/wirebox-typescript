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
  WireboxWebSocket,
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

interface InboundWsOpenMessage {
  type: "ws_open";
  connId: string;
  path: string;
  headers: Record<string, string>;
}

interface InboundWsFrameMessage {
  type: "ws_frame";
  connId: string;
  data: string;
  binary?: boolean;
}

interface InboundWsCloseMessage {
  type: "ws_close";
  connId: string;
  code?: number;
  reason?: string;
}

type InboundTunnelMessage =
  | InboundHttpRequestMessage
  | InboundWsOpenMessage
  | InboundWsFrameMessage
  | InboundWsCloseMessage;

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
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts a Base64 string to a Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts an ArrayBuffer, Uint8Array, or ArrayBufferView to a Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array | ArrayBufferView): string {
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * In-memory WebSocket implementation passed to custom wsHandler callbacks.
 */
class InProcessWebSocket implements WireboxWebSocket {
  readonly connId: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  private readonly _sendToTunnel: (msg: any) => void;
  private readonly _listeners: {
    message: Array<(data: string | Uint8Array, isBinary: boolean) => void>;
    close: Array<(code: number, reason: string) => void>;
    error: Array<(error: Error) => void>;
  } = {
    message: [],
    close: [],
    error: [],
  };

  constructor(
    connId: string,
    path: string,
    headers: Record<string, string>,
    sendToTunnel: (msg: any) => void
  ) {
    this.connId = connId;
    this.path = path;
    this.headers = headers;
    this._sendToTunnel = sendToTunnel;
  }

  send(data: string | Uint8Array | ArrayBuffer): void {
    let frameData: string;
    let isBinary = false;
    if (typeof data === "string") {
      frameData = data;
      isBinary = false;
    } else if (data instanceof ArrayBuffer) {
      frameData = arrayBufferToBase64(data);
      isBinary = true;
    } else if (ArrayBuffer.isView(data)) {
      frameData = arrayBufferToBase64(data);
      isBinary = true;
    } else {
      frameData = String(data);
    }
    this._sendToTunnel({
      type: "ws_frame",
      connId: this.connId,
      data: frameData,
      binary: isBinary,
    });
  }

  close(code: number = 1000, reason: string = ""): void {
    this._sendToTunnel({
      type: "ws_close",
      connId: this.connId,
      code,
      reason,
    });
  }

  on(event: "message", listener: (data: string | Uint8Array, isBinary: boolean) => void): this;
  on(event: "close", listener: (code: number, reason: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "message" | "close" | "error", listener: any): this {
    if (this._listeners[event]) {
      this._listeners[event].push(listener);
    }
    return this;
  }

  /** @internal */
  _emitMessage(data: string | Uint8Array, isBinary: boolean): void {
    for (const fn of this._listeners.message) {
      try {
        fn(data, isBinary);
      } catch {}
    }
  }

  /** @internal */
  _emitClose(code: number, reason: string): void {
    for (const fn of this._listeners.close) {
      try {
        fn(code, reason);
      } catch {}
    }
  }

  /** @internal */
  _emitError(err: Error): void {
    for (const fn of this._listeners.error) {
      try {
        fn(err);
      } catch {}
    }
  }
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

    const activeWsConnections = new Map<
      string,
      {
        type: "virtual" | "socket";
        virtual?: InProcessWebSocket;
        socket?: any;
        close: (code?: number, reason?: string) => void;
        send: (data: string, binary: boolean) => void;
      }
    >();

    const session: TunnelSession = {
      publicUrl: tunnel.public_url,
      publicHost: tunnel.public_host,
      agentHandle: tunnel.agent_handle,
      get isConnected() {
        return isConnected;
      },
      async close(): Promise<void> {
        closedExplicitly = true;
        for (const conn of activeWsConnections.values()) {
          try {
            conn.close(1000, "Tunnel closed");
          } catch {}
        }
        activeWsConnections.clear();
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
        for (const conn of activeWsConnections.values()) {
          try {
            conn.close(1001, "Tunnel disconnected");
          } catch {}
        }
        activeWsConnections.clear();

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

    // 3. Setup Incoming HTTP & WebSocket Request Dispatcher
    const onMessage = async (event: any) => {
      const rawData = typeof event.data === "string" ? event.data : event.data?.toString?.();
      if (!rawData) return;

      let msg: InboundTunnelMessage;
      try {
        msg = JSON.parse(rawData);
      } catch {
        return;
      }

      // Handle WebSocket Open request
      if (msg.type === "ws_open") {
        if (options.wsHandler) {
          const virtual = new InProcessWebSocket(
            msg.connId,
            msg.path,
            msg.headers,
            (toSend) => ws.send(JSON.stringify(toSend))
          );
          activeWsConnections.set(msg.connId, {
            type: "virtual",
            virtual,
            close: (code, reason) => virtual.close(code, reason),
            send: (data, binary) => {
              if (binary) {
                virtual._emitMessage(base64ToUint8Array(data), true);
              } else {
                virtual._emitMessage(data, false);
              }
            },
          });

          // Confirm connection opened to edge
          ws.send(JSON.stringify({ type: "ws_opened", connId: msg.connId }));

          Promise.resolve(options.wsHandler(virtual)).catch((err) => {
            virtual.close(1011, err?.message || "Handler error");
            activeWsConnections.delete(msg.connId);
          });
          return;
        }

        // Local port / URL forwarding for WebSocket
        const targetWsUrl =
          forwardTo.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:") + msg.path;
        const subprotocol = msg.headers["sec-websocket-protocol"];
        let protocols: string[] | undefined = undefined;
        if (subprotocol) {
          protocols = subprotocol.split(",").map((s) => s.trim());
        }

        let localWs: any;
        try {
          localWs = protocols
            ? new WSConstructor(targetWsUrl, protocols)
            : new WSConstructor(targetWsUrl);
          if ("binaryType" in localWs) {
            localWs.binaryType = "arraybuffer";
          }
        } catch (err: any) {
          ws.send(
            JSON.stringify({
              type: "ws_error",
              connId: msg.connId,
              error: err?.message || "Failed to initialize local WebSocket",
            })
          );
          return;
        }

        const onLocalOpen = () => {
          ws.send(JSON.stringify({ type: "ws_opened", connId: msg.connId }));
        };

        const onLocalMessage = async (evt: any) => {
          let data = evt?.data !== undefined ? evt.data : evt;
          if (data && typeof data.arrayBuffer === "function") {
            try {
              data = await data.arrayBuffer();
            } catch {}
          }
          let frameData: string;
          let isBinary = false;
          if (typeof data === "string") {
            frameData = data;
            isBinary = false;
          } else if (data instanceof ArrayBuffer) {
            frameData = arrayBufferToBase64(data);
            isBinary = true;
          } else if (ArrayBuffer.isView(data)) {
            frameData = arrayBufferToBase64(data);
            isBinary = true;
          } else {
            frameData = String(data);
          }
          ws.send(
            JSON.stringify({
              type: "ws_frame",
              connId: msg.connId,
              data: frameData,
              binary: isBinary,
            })
          );
        };

        const onLocalClose = (evt: any) => {
          activeWsConnections.delete(msg.connId);
          ws.send(
            JSON.stringify({
              type: "ws_close",
              connId: msg.connId,
              code: evt?.code || 1000,
              reason: evt?.reason || "",
            })
          );
        };

        const onLocalError = (err: any) => {
          activeWsConnections.delete(msg.connId);
          ws.send(
            JSON.stringify({
              type: "ws_error",
              connId: msg.connId,
              error: err?.message || "Local WebSocket error",
            })
          );
        };

        if (typeof localWs.addEventListener === "function") {
          localWs.addEventListener("open", onLocalOpen);
          localWs.addEventListener("message", onLocalMessage);
          localWs.addEventListener("close", onLocalClose);
          localWs.addEventListener("error", onLocalError);
        } else {
          localWs.onopen = onLocalOpen;
          localWs.onmessage = onLocalMessage;
          localWs.onclose = onLocalClose;
          localWs.onerror = onLocalError;
        }

        activeWsConnections.set(msg.connId, {
          type: "socket",
          socket: localWs,
          close: (code?: number, reason?: string) => {
            try {
              localWs.close(code || 1000, reason || "");
            } catch {}
          },
          send: (data: string, binary: boolean) => {
            try {
              if (binary) {
                localWs.send(base64ToArrayBuffer(data));
              } else {
                localWs.send(data);
              }
            } catch {}
          },
        });
        return;
      }

      // Handle WebSocket Frame message
      if (msg.type === "ws_frame") {
        const conn = activeWsConnections.get(msg.connId);
        if (conn) {
          conn.send(msg.data, !!msg.binary);
        }
        return;
      }

      // Handle WebSocket Close message
      if (msg.type === "ws_close") {
        const conn = activeWsConnections.get(msg.connId);
        if (conn) {
          conn.close(msg.code, msg.reason);
          activeWsConnections.delete(msg.connId);
        }
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
