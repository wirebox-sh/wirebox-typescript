/**
 * Wirebox TypeScript SDK - Personal Agent Identity Layer
 *
 * Demonstrates how an AI platform or agent developer uses Wirebox as the
 * foundational IDENTITY and REAL-WORLD COMMUNICATION layer for autonomous agents.
 *
 * Key Architectural Principle:
 * - Wirebox does NOT implement agent reasoning, LLM orchestration, or task planning.
 * - Wirebox provides the physical IDENTITY INFRASTRUCTURE that equips agents with:
 *   1. Identity Presence: Unique global agent handle (@handle) and tenant isolation
 *   2. Mailbox Infrastructure: Dedicated email address ({handle}@wireboxmail.com)
 *   3. Telecom & Messaging: Dedicated phone numbers, SMS, and Apple iMessage channels
 *   4. Edge Gateway (Tunnel): Reverse-proxy WebSocket tunnel streaming real-world
 *      inbound events directly into the agent's runtime process
 *
 * Run with:
 *   npx tsx examples/personal-agent-identity.ts
 *
 * Options:
 *   npx tsx examples/personal-agent-identity.ts --once   # Runs an automated self-test cycle and exits
 */

import { Wirebox } from "../src/index.js";

async function main() {
  console.log("================================================================");
  console.log("  Wirebox TypeScript SDK — Personal Agent Identity Layer");
  console.log("  Identity & Communication Infrastructure for AI Agents");
  console.log("================================================================\n");

  const client = new Wirebox();

  // --------------------------------------------------------------------------
  // Phase 1: Identity Provisioning & Resolution
  // --------------------------------------------------------------------------
  console.log("[Phase 1: Identity Provisioning & Resolution]");
  const whoami = await client.whoami();
  const isIdentityScoped = Boolean(whoami.auth?.scoped_identity_id);

  let identity;
  let dynamicCreated = false;

  if (isIdentityScoped) {
    console.log("✔ Operating in Identity-Scoped Mode (Strict Tenant Isolation)");
    identity = await client.getIdentity();
    console.log(`✔ Loaded active agent identity: @${identity.agent_handle} (${identity.display_name})\n`);
  } else {
    console.log("✔ Operating in Platform Admin Mode");
    const handleSuffix = Math.random().toString(36).slice(2, 6);
    const agentHandle = `assistant-${handleSuffix}`;
    console.log(`Provisioning new agent identity container: @${agentHandle}...`);
    identity = await client.createIdentity({
      agent_handle: agentHandle,
      display_name: "Personal Travel Coordinator",
      description: "Dedicated real-world identity for autonomous travel coordination",
    });
    dynamicCreated = true;
    console.log(`✔ Identity container provisioned! ID: ${identity.id}\n`);
  }

  // --------------------------------------------------------------------------
  // Phase 2: Inspect Communication Assets Bound to this Identity
  // --------------------------------------------------------------------------
  console.log("----------------------------------------------------------------");
  console.log(`  Identity Assets Bound to @${identity.agent_handle}`);
  console.log("----------------------------------------------------------------");
  console.log(`  📧 Mailbox:     ${identity.mailbox.email_address}`);
  console.log(`  🌐 Edge Tunnel: ${identity.tunnel.public_url}`);
  console.log(`  📱 Messaging:   ${identity.imessage_enabled ? "Apple iMessage & SMS Active" : "Configured for SMS & Phone"}`);
  console.log("----------------------------------------------------------------\n");

  // --------------------------------------------------------------------------
  // Phase 3: Phone & Telecom Infrastructure
  // --------------------------------------------------------------------------
  console.log("[Phase 2: Phone & Telecom Infrastructure]");
  try {
    const existingPhone = await identity.getPhoneNumber();
    console.log(`✔ Bound carrier phone number: ${existingPhone.phone_number} (Status: ${existingPhone.status})\n`);
  } catch {
    console.log(`Requesting carrier phone number allocation for @${identity.agent_handle}...`);
    try {
      const newPhone = await client.phone.numbers.provision({
        agent_handle: identity.agent_handle,
        country_code: "US",
        type: "local",
      });
      console.log(`✔ Carrier phone number provisioned: ${newPhone.phone_number} (${newPhone.type})\n`);
    } catch (err: any) {
      if (err.status === 403 && err.message?.includes("phone_provisioning_restricted")) {
        console.log("ℹ️  [Telecom Gate] Phone number provisioning is currently in Private Beta.");
        console.log("    (Once organization is whitelisted, dedicated US/CA cellular numbers activate instantly)\n");
      } else if (err.status === 409) {
        console.log("✔ Agent already possesses an active phone number.\n");
      } else {
        console.log(`ℹ️  [Telecom Notice] ${err.message}\n`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Phase 4: Outbound Real-World Communication (Using Identity Mailbox)
  // --------------------------------------------------------------------------
  console.log("[Phase 3: Outbound Communication via Identity Mailbox]");
  console.log("Dispatching travel reservation confirmation from agent's dedicated identity...");

  const recipient = process.env.AGENT_RECIPIENT || identity.mailbox.email_address;
  try {
    const emailResult = await identity.sendEmail({
      to: recipient,
      subject: "[Confirmed] Flight SFO -> HND Reservation for Alex",
      text: [
        "Hello Alex,",
        "",
        "Your autonomous travel assistant has finalized your booking:",
        "  - Flight: NH 107 (San Francisco -> Tokyo Haneda)",
        "  - Status: Confirmed & Ticketed",
        "  - Booking Ref: WB-9921B",
        "",
        "This notification was dispatched using the agent's dedicated Wirebox identity mailbox.",
        "You can reply directly to this thread anytime to request adjustments.",
        "",
        `— ${identity.display_name} (@${identity.agent_handle})`,
      ].join("\n"),
    });

    console.log("✔ Outbound email dispatched!");
    console.log(`  Message ID: ${emailResult.id || (emailResult as any).message_id}`);
    console.log(`  Recipient:  ${recipient}\n`);
  } catch (err: any) {
    if (err.message?.includes("not a verified address")) {
      console.log(`ℹ️ [Sandbox Notice] Recipient '${recipient}' is not verified in sandbox mode.`);
      console.log("   (Set AGENT_RECIPIENT=<your-verified-email> to test external delivery)\n");
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Phase 5: Inbound Edge Gateway (Ingesting Real-World Signals into Agent)
  // --------------------------------------------------------------------------
  console.log("[Phase 4: Inbound Edge Gateway (Mail & Phone Events)]");
  console.log("Bridging agent runtime process to Wirebox edge reverse-proxy tunnel...");

  const targetEndpoint = `${identity.tunnel.public_url}/webhook`;
  const hook = await identity.createWebhook({
    url: targetEndpoint,
    events: ["email.received", "test.ping", "sms.received"],
  });
  console.log(`✔ Webhook route bound: ${hook.id} -> ${targetEndpoint}`);

  const session = await identity.connectTunnel({
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
        console.log(`\n[${now}] 🏓 [Identity Gateway] Health ping received. Returning 200 OK.`);
        return new Response(JSON.stringify({ status: "alive" }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (eventType === "email.received") {
        const msg = payload.data?.message;
        const subject = msg?.subject || "(no subject)";

        console.log(`\n[${now}] 📬 [Identity Gateway] Inbound Email received:`);
        console.log(`   From:    ${msg?.from}`);
        console.log(`   Subject: ${subject}`);

        // Acknowledge receipt via identity reply method
        if (msg?.id) {
          await identity.replyEmail(msg.id, {
            text: `Hello,\n\nReceived your inquiry regarding "${subject}". Processing now.\n\n— @${identity.agent_handle}`,
          });
          console.log("   ⚡ Automated acknowledgment reply dispatched.");
        }
      }

      if (eventType === "sms.received") {
        const sms = payload.data?.message;
        console.log(`\n[${now}] 📱 [Identity Gateway] Inbound SMS received:`);
        console.log(`   From:    ${sms?.from_number || sms?.from || "Unknown"}`);
        console.log(`   Text:    ${sms?.text || "(empty)"}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  console.log("\n================================================================");
  console.log("  ✔ Agent Identity Inbound Gateway Online!");
  console.log(`  Dedicated Mailbox: ${identity.mailbox.email_address}`);
  console.log(`  Edge Tunnel:       ${identity.tunnel.public_url}`);
  console.log("  Ready to stream inbound emails, SMS, and events into agent runtime.");
  console.log("================================================================\n");

  const cleanup = async () => {
    console.log("\nClosing tunnel session...");
    await session.close().catch(() => {});
    if (hook?.id) {
      console.log(`Removing webhook route ${hook.id}...`);
      await client.webhooks.delete(hook.id).catch(() => {});
    }
    if (dynamicCreated) {
      console.log(`Decommissioning ephemeral identity @${identity.agent_handle}...`);
      await identity.delete().catch(() => {});
    }
    console.log("✔ Teardown complete. Exiting.");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  if (process.argv.includes("--once")) {
    console.log("Running self-test check (pinging webhook)...");
    const testResult = await client.webhooks.test(hook.id);
    console.log(`Self-test status: ${testResult.status_code} (${testResult.latency_ms}ms)`);
    await cleanup();
    return;
  }

  await session.waitClosed();
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
