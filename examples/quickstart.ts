/**
 * Wirebox TypeScript SDK - Quickstart Example
 *
 * Demonstrates:
 * 1. Zero-config client instantiation (inherits ~/.wirebox/credentials or env vars)
 * 2. Caller and Agent Identity resolution
 * 3. Asynchronous iteration over messages (agent.iterMessages)
 * 4. Message details inspection (agent.getMessage)
 *
 * Run with:
 *   npx tsx examples/quickstart.ts
 */

import { Wirebox } from "../src/index.js";

async function main() {
  console.log("==================================================");
  console.log("  Wirebox TypeScript SDK — Quickstart Playground");
  console.log("==================================================\n");

  // 1. Initialize client without any explicit credentials.
  // It automatically looks up:
  // - WIREBOX_API_KEY environment variable
  // - ~/.wirebox/credentials configuration file
  const client = new Wirebox();
  console.log("✔ Wirebox client initialized successfully.");

  // 2. Whoami: Inspect current caller organization & auth telemetry
  const whoami = await client.whoami();
  console.log(`✔ Authenticated as organization: "${whoami.organization.name}" (auth type: ${whoami.auth.type})`);

  // 3. Get Active Agent Identity
  // Calling getIdentity() without arguments loads the default active agent
  const agent = await client.getIdentity();
  console.log("\n--- Active Agent Snapshot ---");
  console.log(`  Agent Handle: @${agent.agent_handle}`);
  console.log(`  Display Name: ${agent.display_name}`);
  console.log(`  Mailbox:      ${agent.mailbox.email_address}`);
  console.log(`  Tunnel URL:   ${agent.tunnel.public_url}`);
  console.log(`  Status:       ${agent.status}`);

  // 4. Async Iterator (for await ... of agent.iterMessages())
  // Demonstrates modern auto-paginating generator pattern
  console.log("\n--- Mailbox Message Stream (via agent.iterMessages) ---");
  let count = 0;
  for await (const msg of agent.iterMessages({ limit: 5 })) {
    count++;
    const dirTag = msg.direction === "outbound" ? "▲ OUT" : "▼ IN ";
    const target = msg.direction === "outbound"
      ? (Array.isArray(msg.to) ? msg.to.join(", ") : (msg.to_addresses ? msg.to_addresses.join(", ") : "-"))
      : (msg.from || msg.from_address || "-");

    console.log(`  ${count}. [${dirTag}] ${msg.id}`);
    console.log(`     Subject: ${msg.subject || "(no subject)"}`);
    console.log(`     Contact: ${target}`);
    console.log(`     Date:    ${msg.created_at}`);
  }

  if (count === 0) {
    console.log("  (Mailbox is empty)");
  }

  // 5. Inspect the latest message in detail
  const page = await agent.listMessages({ limit: 1 });
  if (page.messages && page.messages.length > 0) {
    const latestId = page.messages[0].id;
    console.log(`\n--- Inspecting Full Message: ${latestId} ---`);
    const fullMsg = await agent.getMessage(latestId);

    console.log(`  Direction:  ${fullMsg.direction}`);
    console.log(`  From:       ${fullMsg.from || fullMsg.from_address}`);
    console.log(`  To:         ${Array.isArray(fullMsg.to) ? fullMsg.to.join(", ") : (fullMsg.to || "-")}`);
    console.log(`  Subject:    ${fullMsg.subject}`);
    console.log(`  Thread ID:  ${fullMsg.thread_id || "-"}`);
    console.log(`  Body Preview:`);
    const bodyText = fullMsg.text || "(no text body)";
    console.log(`    ${bodyText.split("\n").slice(0, 5).join("\n    ")}`);
  }

  console.log("\n==================================================");
  console.log("  Done! TypeScript SDK works cleanly and smoothly.");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ SDK Execution Error:", err);
  process.exit(1);
});
