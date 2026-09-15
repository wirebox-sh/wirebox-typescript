/**
 * Wirebox TypeScript SDK - 3-Tier Credentials Resolver
 *
 * Resolves API key using fallback hierarchy:
 * 1. Explicit options.apiKey
 * 2. WIREBOX_API_KEY environment variable
 * 3. ~/.wirebox/config file
 *
 * Safe across all JS runtimes (Node.js, Bun, Deno, Cloudflare Workers, Browsers).
 */

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    process !== null &&
    typeof process.versions === "object" &&
    typeof process.versions.node === "string"
  );
}

function getEnvApiKey(): string | undefined {
  if (typeof process !== "undefined" && process?.env?.WIREBOX_API_KEY) {
    const key = process.env.WIREBOX_API_KEY.trim();
    if (key) return key;
  }
  return undefined;
}

function getConfigFileApiKey(): string | undefined {
  if (!isNodeRuntime()) return undefined;

  try {
    // Dynamic require in Node environment
    const fs = (globalThis as any).require("node:fs");
    const path = (globalThis as any).require("node:path");
    const os = (globalThis as any).require("node:os");

    const home = os.homedir();
    const configPath = path.join(home, ".wirebox", "config");

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8").trim();
      // Try JSON format
      if (content.startsWith("{")) {
        const parsed = JSON.parse(content);
        if (parsed.api_key || parsed.apiKey) {
          return (parsed.api_key || parsed.apiKey).trim();
        }
      }
      // Try INI or KEY=VALUE format
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("api_key=") || trimmed.startsWith("apiKey=")) {
          return trimmed.split("=")[1]?.trim();
        }
      }
      // Fallback: entire file is the raw key
      if (content.startsWith("wb_live_")) {
        return content;
      }
    }
  } catch {
    // Ignore file system errors
  }

  return undefined;
}

/**
 * Resolves the effective API key following the 3-tier precedence rules.
 */
export function resolveApiKey(explicitKey?: string): string | undefined {
  if (explicitKey && explicitKey.trim()) {
    return explicitKey.trim();
  }

  const envKey = getEnvApiKey();
  if (envKey) {
    return envKey;
  }

  const fileKey = getConfigFileApiKey();
  if (fileKey) {
    return fileKey;
  }

  return undefined;
}
