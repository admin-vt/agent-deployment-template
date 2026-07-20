# agent-deployment-template

Viral Tilt's reusable template for deploying bespoke client agents. One deployment = one clone of this repo — **the template itself is never deployed** (`template.config.ts` holds CHANGE-ME placeholders; the deploy script enforces this). `REQUIREMENTS.md` is the decision authority — if guidance here or anywhere else conflicts with it, REQUIREMENTS.md wins.

## Where things are

| Need | Go to |
|---|---|
| Product decisions, scope, what's permanently out | `REQUIREMENTS.md` |
| Identity model (agent accounts, allowlists, org shape) | `docs/identity-model.md` |
| Dev-environment and secrets workflow | `docs/dev-environment.md` |
| System architecture as built, live PoC endpoints | `docs/architecture.md` |
| Per-client customization (skills, toolkits, models, surfaces) | `docs/customization.md` |
| Slack app setup (manifest, credentials, verify) | `docs/slack-setup.md` |
| What's been empirically verified + vendor gotchas learned | `docs/verification-log.md` |
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
npm run deploy     # mastra deploy (headless: needs MASTRA_API_TOKEN + MASTRA_ORG_ID + MASTRA_PROJECT_ID)
```

Onboarding app (`onboarding/`) deploys to Vercel: `vercel deploy --prod --yes` from that directory.
