# Identity model — users, agents, orgs

The overarching shape. This supersedes any per-human user model implied elsewhere; where older docs disagree, this document wins.

## The one idea

**An agent has exactly one account. Humans are allowed conversants, not accounts.**

There is no per-employee identity, no roster of client staff, no role system. Each deployed agent has a single **agent account**; everything the agent can do — its tool authorizations, its model key — hangs off that one account. The people at the client who may talk to the agent are listed on a **Slack allowlist**, nothing more.

```
VT (agency)
└── Client  (WorkOS Organization — grouping/billing container)
    └── Agent deployment  (one clone of this template)
        ├── Agent account  (ONE WorkOS user; the identity everything scopes to)
        │   ├── credential: generated password, handed off at delivery
        │   ├── email: the client owner's real address (resets flow to accountability)
        │   ├── tool authorizations: Composio connected accounts — THIS agent's project only
        │   ├── model key: the client's OpenRouter key (BYOK)
        │   └── settings: the Slack allowlist (WorkOS user metadata)
        └── Slack allowlist  (emails of people allowed to talk to the agent)
```

## Why this shape

- **Per-agent consent is structural.** Each deployment has its own Composio project + API key; the agent account's connected accounts live inside that project only. Authorizing Firecrawl (or Gmail) for agent A cannot bleed to agent B — not by convention, by isolation. Authorized tools for a new agent means deliberately authorizing them again. That re-authorization ceremony is the feature.
- **The client owns the agent, people just use it.** Tools connected to the agent are *the client's* tools, deliberately granted by whoever holds the credential. The agent acts as itself — not as individual employees. Handoff guidance: connect service/shared accounts (support@, a service mailbox), never a personal one you wouldn't hand every allowlisted person.
- **Ops stays countable.** Per deployment, VT manages exactly two things: one credential, one list.

## Handoff flow (per deployment)

1. Runbook creates: WorkOS Organization (client, if new) → one WorkOS user (agent account, on the client owner's email, generated password) → Composio project for this agent → seeds the Slack allowlist with the client's initial emails.
2. VT sends the client: the onboarding link + the credential. Instructions: sign in, authorize the listed tools, add your OpenRouter key, manage the allowlist.
3. People on the allowlist just talk to it in Slack. Nothing to sign up for.

## Slack enforcement

- Workspace install lets the bot exist in the workspace; the **allowlist decides who it engages with**.
- On each message: resolve the sender's email (requires the `users:read.email` bot scope), check against the allowlist. Listed ⇒ full agent (all its authorized tools). Unlisted ⇒ one-line reply: ask the account holder to add you.
- **Default closed.** An empty allowlist means the agent talks to nobody.
- The allowlist lives in the agent account's WorkOS user metadata; whoever holds the agent credential edits it on the onboarding page. Holding the credential IS being the admin.

## WorkOS mapping

- One **production** environment for all real clients (test env keeps serving PoC/demo deployments).
- One Organization per client — a grouping/billing container, not a user roster.
- One user per agent — the agent account. WorkOS provides sessions, password reset (flows to the owner's email), and MFA for free.
- If an agent ever genuinely needs individual-identity tools ("reply from *my* email"), that agent graduates to a per-human model — designed then, not now. The WorkOS machinery already supports it.

## What this replaces

- ~~Per-human WorkOS users self-signing-up on the onboarding page~~ → one provisioned account per agent.
- ~~Composio userId = per-human WorkOS id in a shared org~~ → Composio project per agent; userId is the agent account.
- ~~Per-user BYOK keys~~ → one client key per agent, on the agent account.
