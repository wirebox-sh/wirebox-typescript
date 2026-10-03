/**
 * Wirebox TypeScript SDK - Autonomous Auto-Reply Agent Example
 *
 * Demonstrates:
 * 1. Resolving the active AgentIdentity
 * 2. Ensuring an agent-scoped webhook is active
 * 3. Connecting an in-memory WebSocket reverse-proxy tunnel
 * 4. Intercepting "email.received" events in process memory
 * 5. Automatically sending a reply via agent.replyEmail()
 *
 * Run with:
 *   npx tsx examples/auto-reply.ts
 */

import { Wirebox } from "../src/index.js";

async function main() {
  console.log("========================================================");
  console.log("  Wirebox TypeScript SDK — Autonomous Auto-Reply Agent");
  console.log("========================================================\n");

  const client = new Wirebox();
  const agent = await client.getIdentity();

  console.log(`Agent Handle:    @${agent.agent_handle}`);
  console.log(`Display Name:    ${agent.display_name}`);
  console.log(`Mailbox Address: ${agent.mailbox.email_address}`);
  console.log(`Tunnel URL:      ${agent.tunnel.public_url}`);

  const targetEndpoint = `${agent.tunnel.public_url}/webhook`;

  // 1. Ensure webhook exists
  const webhooks = await agent.listWebhooks();
  let hook = webhooks.find((w) => w.url === targetEndpoint);
  let ephemeral = false;

  if (!hook) {
    console.log(`\nSetting up webhook subscription for ${targetEndpoint}...`);
    hook = await agent.createWebhook({
      url: targetEndpoint,
      events: ["email.received", "test.ping"],
    });
    ephemeral = true;
    console.log(`✔ Webhook registered: ${hook.id}`);
  } else {
    console.log(`✔ Using existing webhook subscription: ${hook.id}`);
  }

  // 2. Connect in-memory tunnel session
  console.log("\nConnecting in-memory tunnel gateway...");
  const session = await agent.connectTunnel({
    handler: async (request: Request) => {
      const now = new Date().toTimeString().slice(0, 8);

      let payload: any = null;
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }

      const eventType = payload.event_type || payload.type || "unknown";

      if (eventType === "test.ping") {
        console.log(`[${now}] 🏓 Ping event received. Returning 200 OK.`);
        return new Response(JSON.stringify({ pong: true }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (eventType === "email.received") {
        const incoming = payload.data?.message;
        const sender = incoming?.from || "Unknown sender";
        const subject = incoming?.subject || "(no subject)";
        const snippet = incoming?.snippet || "";

        console.log(`\n[${now}] 📬 Email received!`);
        console.log(`   From:    ${sender}`);
        console.log(`   Subject: ${subject}`);
        if (snippet) console.log(`   Snippet: ${snippet}`);

        if (incoming?.id) {
          try {
            console.log(`   ⚡ Dispatching automated reply via agent.replyEmail()...`);
            const reply = await agent.replyEmail(incoming.id, {
              text: `Hello!\n\nThis is an automated response from @${agent.agent_handle} powered by the Wirebox TypeScript SDK.\n\nI have received your email: "${subject}".\n\nAll systems operational!`,
            });
            const replyId = reply.id || (reply as any).message_id;
            console.log(`   ✔ Reply dispatched successfully! ID: ${replyId}`);
          } catch (replyErr: any) {
            console.error(`   ❌ Failed to reply: ${replyErr.message}`);
          }
        }
      } else {
        console.log(`[${now}] ℹ️ Received event: ${eventType}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  console.log("✔ Tunnel connected and ready to receive real-world events!");
  console.log("\n💡 Test this agent now by sending an email to:");
  console.log(`   👉 ${agent.mailbox.email_address}`);
  console.log("\nWaiting for incoming events (Press Ctrl+C to exit)...\n");

  const cleanup = async () => {
    console.log("\nDisconnecting tunnel session...");
    await session.close().catch(() => {});
    if (ephemeral && hook?.id) {
      console.log(`Removing ephemeral webhook ${hook.id}...`);
      await client.webhooks.delete(hook.id).catch(() => {});
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await session.waitClosed();
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
