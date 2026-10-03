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

function getNodeModule(name: string): any {
  if (typeof (process as any).getBuiltinModule === "function") {
    try {
      const mod =
        (process as any).getBuiltinModule(name) ||
        (process as any).getBuiltinModule(name.replace(/^node:/, ""));
      if (mod) return mod;
    } catch {}
  }
  try {
    if (typeof (globalThis as any).require === "function") {
      return (globalThis as any).require(name);
    }
  } catch {}
  return undefined;
}

function getConfigFileApiKey(): string | undefined {
  if (!isNodeRuntime()) return undefined;

  try {
    const fs = getNodeModule("node:fs");
    const path = getNodeModule("node:path");
    const os = getNodeModule("node:os");

    if (!fs || !path || !os) return undefined;

    const home = process.env.WIREBOX_HOME || os.homedir();
    const hasCustomPath = Boolean(process.env.WIREBOX_CREDENTIALS_PATH || process.env.WIREBOX_CONFIG_PATH);
    const candidatePaths = hasCustomPath
      ? ([process.env.WIREBOX_CREDENTIALS_PATH, process.env.WIREBOX_CONFIG_PATH].filter(Boolean) as string[])
      : [path.join(home, ".wirebox", "credentials"), path.join(home, ".wirebox", "config")];

    for (const configPath of candidatePaths) {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8").trim();
        // Try JSON format
        if (content.startsWith("{")) {
          try {
            const parsed = JSON.parse(content);
            if (parsed.api_key || parsed.apiKey) {
              return (parsed.api_key || parsed.apiKey).trim();
            }
          } catch {}
        }
        // Try INI or KEY=VALUE format
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
          const eq = trimmed.indexOf("=");
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
          if (key === "api_key" || key === "apiKey") {
            return value;
          }
        }
        // Fallback: entire file is the raw key
        if (content.startsWith("wb_live_") || content.startsWith("wb_test_")) {
          return content.split("\n")[0].trim();
        }
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
