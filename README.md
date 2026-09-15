# @wirebox-sh/sdk

> The official TypeScript SDK for [Wirebox](https://wirebox.sh) — the real-world identity, communication, and context execution layer for AI agents.

[![npm version](https://img.shields.io/npm/v/@wirebox-sh/sdk.svg)](https://www.npmjs.com/package/@wirebox-sh/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Equip autonomous AI agents with phone numbers, voice streaming, SMS, and email inboxes in minutes.

---

## Features

- **Zero-Setup Agent Autonomy**: Agents can self-register with a human supervisor email and immediately acquire a dedicated mailbox and scoped API key.
- **Action-Oriented Domain Entities**: Identities aren't passive rows — `AgentIdentity` instances directly perform actions like `agent.sendEmail()` and `agent.listMessages()`.
- **Async Generator Pagination**: Auto-paginate inboxes with idiomatic `for await (const msg of agent.iterMessages())`.
- **Zero Runtime Dependencies**: Built entirely on modern Web Standards (`fetch`, `AbortController`, `crypto`), safe across Node.js, Bun, Deno, Cloudflare Workers, and Edge runtimes.
- **Robust Error Hierarchy**: Strongly-typed error classes mapped to HTTP status codes and Wirebox error codes.

---

## Installation

```bash
npm install @wirebox-sh/sdk
# or
pnpm add @wirebox-sh/sdk
# or
bun add @wirebox-sh/sdk
```

---

## Quickstart

### 1. Zero-Setup Agent Self-Signup

No pre-existing account or credit card required. An agent running in a terminal or container can bootstrap itself:

```typescript
import { Wirebox } from "@wirebox-sh/sdk";

// Step 1: Self-register without prior credentials
const signup = await Wirebox.signup({
  human_email: "human@example.com",
  display_name: "Research Assistant",
  note_to_human: "Hi! I am your AI assistant. Please share the 6-digit verification code sent to your email.",
  harness: "claude-code",
});

console.log("Allocated Mailbox:", signup.email_address); // e.g. agent-a1b2c3@wireboxmail.com
console.log("Secret API Key:", signup.api_key);          // wb_live_...

// Step 2: Initialize client
const wirebox = new Wirebox({ apiKey: signup.api_key });

// Step 3: Send introductory email to human (allowed before verification)
const agent = await wirebox.getIdentity();
await agent.sendEmail({
  to: "human@example.com",
  subject: "Ready for tasks!",
  text: "I have initialized my Wirebox inbox. Please send me the 6-digit code from your email to unlock full sending limits.",
});

// Step 4: Verify with code received from human
await wirebox.verifySignup({ verification_code: "582194" });
```

### 2. Identity Management

Provision and manage persistent agent personas and dedicated inboxes across your organization:

```typescript
import { Wirebox } from "@wirebox-sh/sdk";

const wirebox = new Wirebox({ apiKey: process.env.WIREBOX_API_KEY });

// 1. Provision a new identity — creates @sales-bot and sales-bot@wireboxmail.com atomically
const agent = await wirebox.createIdentity({
  agent_handle: "sales-bot",
  display_name: "Sales Assistant",
  description: "Autonomous lead triage and qualification agent",
});

console.log("Handle:", agent.agent_handle);                   // "sales-bot"
console.log("Mailbox Address:", agent.mailbox.email_address); // "sales-bot@wireboxmail.com"

// 2. Retrieve an existing identity by handle
const existing = await wirebox.getIdentity("sales-bot");

// 3. List all identities in your organization
const { identities, total } = await wirebox.listIdentities({ limit: 20 });
console.log(`Total identities: ${total}`);
for (const id of identities) {
  console.log(`- @${id.agent_handle} (${id.mailbox.email_address})`);
}

// 4. Update profile attributes directly on the agent instance
const updated = await agent.update({
  display_name: "Senior Sales Lead",
  description: "Tier-2 enterprise sales specialist",
});
console.log("Updated Display Name:", updated.display_name);

// 5. Delete an identity and tear down its associated mailbox
await agent.delete();
```

---

### 3. Sending & Managing Emails

```typescript
import { Wirebox } from "@wirebox-sh/sdk";

const wirebox = new Wirebox({ apiKey: process.env.WIREBOX_API_KEY });
const agent = await wirebox.getIdentity("sales-bot");

// 1. Send outbound email
const sent = await agent.sendEmail({
  to: "customer@example.com",
  subject: "Q3 Project Update",
  text: "Here is your weekly summary...",
  html: "<p>Here is your weekly summary...</p>",
});

// 2. Fetch single page of messages
const inbox = await agent.listMessages({ limit: 20 });
for (const msg of inbox.messages) {
  console.log(`[${msg.from_address}] ${msg.subject}`);
}

// 3. Auto-paginating inbox traversal
for await (const message of agent.iterMessages()) {
  console.log(message.subject, message.created_at);
}

// 4. Retrieve full email body
const fullEmail = await agent.getMessage(inbox.messages[0].id);
console.log(fullEmail.text);

// 5. Reply to email (preserves RFC thread headers)
await agent.replyEmail(fullEmail.id, {
  text: "Thanks for reaching out! We received your request.",
});

// 6. Delete message
await agent.deleteMessage(fullEmail.id);
```

---

### 4. Caller Introspection (`whoami`)

```typescript
import { Wirebox } from "@wirebox-sh/sdk";

const wirebox = new Wirebox();
const me = await wirebox.whoami();

console.log(`Organization: ${me.organization.name}`);
console.log(`Verified Status: ${me.organization.is_claimed ? "Claimed" : "Unclaimed"}`);
console.log(`Active Agents: ${me.usage.agents_count} / ${me.usage.agents_limit}`);
```

---

## Authentication Fallback

The `Wirebox` client automatically attempts to resolve credentials in the following order:

1. Explicit option passed to constructor: `new Wirebox({ apiKey: "..." })`
2. Environment variable: `process.env.WIREBOX_API_KEY`
3. Global CLI configuration: `~/.wirebox/config`

---

## Error Handling

All SDK errors inherit from `WireboxError`:

```typescript
import {
  Wirebox,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  HandleAlreadyTakenError,
} from "@wirebox-sh/sdk";

try {
  const wirebox = new Wirebox();
  await wirebox.createIdentity({ agent_handle: "taken-handle" });
} catch (err) {
  if (err instanceof HandleAlreadyTakenError) {
    console.error("This agent handle is already registered:", err.message);
  } else if (err instanceof AuthenticationError) {
    console.error("Invalid or missing API key:", err.message);
  } else if (err instanceof RateLimitError) {
    console.error("Rate limited! Retry in seconds:", err.retryAfterSeconds);
  }
}
```

---

## License

MIT © [Wirebox Team](https://wirebox.sh)
