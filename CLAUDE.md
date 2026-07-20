# agent-deployment-template

## What this is

Viral Tilt's reusable template for deploying bespoke client agents. One deployment = one private clone of this repo (it's a GitHub template repo), stood up by a human driving Claude Code through the checked-in runbook, then customized per client — skills, tools, instructions. The template's job is to make deployment #2, #3, #10 boring: same stack, same wiring, same steps; only the agent differs.

**The template itself is never deployed.** `template.config.ts` holds CHANGE-ME placeholders, and `scripts/deploy.sh` / `scripts/slack-app-create.mjs` refuse to run while any remain. This file is the decision authority — if other docs conflict with it, this one wins.

## Why it's shaped this way

- **Agency-owned everything; clients bill their own model spend.** VT owns all vendor accounts (Mastra, Composio, WorkOS, Vercel, GitHub, the Slack apps); each deployment is a project/tenant inside them. The client's one direct cost is models — BYOK via their OpenRouter key.
- **One agent = one identity** (`docs/identity-model.md`). Each deployment has a single agent account (one WorkOS user); every tool authorization and the client's model key hang off it. Humans are emails on a Slack allowlist (default closed), not accounts — no rosters, no roles. Per deployment, VT manages exactly one credential and one list.
- **Tool consent is structural, not conventional.** Every agent gets its own Composio project, so authorizing a tool for agent A cannot bleed to agent B. The template ships **zero toolkits** — every tool is a deliberate per-client grant, and content-ingesting ones (web search, email, docs) deserve particular scrutiny: whatever they read, the agent reads.
- **The workspace repo is the agent's only durable filesystem** — a separate per-agent git repo cloned into the ephemeral Composio sandbox each session. Kept separate from the deployment repo on purpose: the agent's runtime write access must never reach its own instructions, skills, or deployable code.
- **Skills are the per-client IP layer**, in standard `SKILL.md` format (agentskills.io) so they survive any framework move. The template ships one closed-box worked example (`skills/workspace`).
- **Slack is per-deployment too.** Each agent gets its own Slack app (created via the manifest API), installed by the client with one Add-to-Slack click on the onboarding console; the bot token lives in agent-account metadata and is resolved at runtime — installs need no redeploy.

## The stack (locked)

| Layer | Choice |
|---|---|
| Runtime | Mastra platform (hosted), one project per deployment; chat history + agent memory live there — no database in the repo |
| Models | OpenRouter, fully model-agnostic; the client's key (BYOK) on the agent account, deployment dev key as fallback |
| Tools | Composio, used natively and fully — catalog, auth, execution, triggers |
| Code execution | Composio Remote Sandbox + the per-agent workspace git repo |
| Chat surfaces | Mastra channel adapters — Slack first; others attach the same way per client |
| Onboarding | Next.js on Vercel, WorkOS AuthKit-gated agent console |
| Secrets | Doppler, one project per deployment; operator creds in this repo's project |

Permanently rejected: a self-serve builder agent; per-human end-user accounts; abstraction seams/wrappers over Composio.

## Where things are

| Need | Go to |
|---|---|
| Identity model (agent accounts, allowlists, org shape) | `docs/identity-model.md` |
| System architecture as built, endpoint shapes | `docs/architecture.md` |
| Per-client customization (skills, toolkits, models, surfaces) | `docs/customization.md` |
| Slack app setup (creation script, install flow, verify) | `docs/slack-setup.md` |
| What's been empirically verified + vendor gotchas learned | `docs/verification-log.md` |
| Dev-environment and secrets workflow | `docs/dev-environment.md` |
| Stand up a new deployment | `.claude/skills/runbook/SKILL.md` |
| Vendor documentation sources (llms.txt endpoints) | `.claude/skills/stack-docs/SKILL.md` |
| Every per-client value | `template.config.ts` |
| Env var inventory | `.env.example` |

## Working rules

- **Secrets:** never in git. Doppler is the source of truth; `./scripts/worktree-setup.sh` writes `.env` per worktree. This environment is headless — token auth only, no browser login flows (see `docs/dev-environment.md`).
- **Build from vendor docs, not memory** — the stack moves weekly; use the stack-docs skill's sources before touching any vendor API.
- **Pin versions exactly.** No `^`/`~` in package.json; upgrades are deliberate commits.
- **Sandbox commands must be idempotent** — Composio's backend can dispatch a command twice concurrently (verified). See the workspace tools in `src/lib/workspace.ts` for the pattern.
- **Verify empirically, log it.** New vendor behavior findings go in `docs/verification-log.md`.

## Commands

```bash
npm run dev        # local Mastra dev server + studio (localhost:4111)
npm run typecheck  # both apps have this; onboarding/ is its own package
./scripts/deploy.sh <mastra-project>  # .env.production + mastra deploy (headless)
```

Onboarding app (`onboarding/`) deploys to Vercel: `vercel deploy --prod --yes` from that directory.
