# Architecture — as built

One deployment = one clone of this repo, wired to agency-owned vendor accounts. **The template itself is never deployed** — `template.config.ts` holds CHANGE-ME placeholders and the deploy script refuses while they remain. The live reference is the most recent runbook-produced deployment.

```
Slack / other surfaces (Mastra channel adapters — added per client)
        │
        ▼
Mastra platform project  ──────────────  https://<project>.server.mastra.cloud
  └─ Agent (src/mastra/agents/assistant.ts)
      ├─ model: OpenRouter via Mastra model router  ("openrouter/<provider>/<model>")
      ├─ memory: @mastra/memory + platform-provisioned storage (no DB in repo)
      ├─ skills: standard SKILL.md dirs from /skills (agentskills.io format)
      └─ tools (resolved per request, per user):
          ├─ Composio session tools — the user's connected accounts, toolkit
          │    catalog, search/execute meta-tools, Remote Sandbox bash
          └─ workspace tools (src/lib/workspace.ts) — git-backed persistent
               filesystem inside the sandbox
        │
        ▼
Composio (tool layer)                     GitHub (workspace repo)
  ├─ auth configs per toolkit              └─ /mnt/files/workspace in the
  ├─ connected accounts per user               sandbox; clone → work → push;
  └─ Remote Sandbox per session                the repo is the durable state

Onboarding surface (onboarding/, Next.js on Vercel)
  ├─ WorkOS AuthKit login (proxy.ts middleware)
  ├─ /api/connections — connect toolkits (OAuth → Composio Connect Link;
  │    operator-key toolkits like Firecrawl → created server-side)
  ├─ /api/openrouter-key — user's BYOK key, validated against OpenRouter,
  │    stored in WorkOS user metadata (deployment stays storage-free)
  └─ /api/slack/install + /api/slack/callback — "Add to Slack": OAuth v2
       install of this deployment's own Slack app; bot token → agent-account
       metadata (slackBotToken), resolved by the agent per call — no redeploy
```

## Key mechanics

- **Single agent identity.** One agent account per deployment (docs/identity-model.md): a single WorkOS user whose id is the Composio userId for all tool sessions (`src/lib/composio.ts`, `src/lib/identity.ts`). Its WorkOS metadata carries the Slack allowlist and the client's model key. Slack messages are guarded by channel handlers: sender email (via `users.info`) checked against the allowlist, default closed.
- **Sandbox state model.** Sandboxes are ephemeral; `/mnt/files` persists per session only. Durable work goes through the workspace repo via the three idempotent tools (`workspace_init` / `workspace_run` / `workspace_commit`). Commands must tolerate re-execution — the backend occasionally double-dispatches (see verification log V4).
- **BYOK.** The client sets their OpenRouter key on the onboarding console; it lives in the agent account's metadata and the agent's model resolves it dynamically per request (`model: async () => ({ id, apiKey })`), with the deployment's `OPENROUTER_API_KEY` dev key as fallback.
- **Per-deployment Slack app.** Each agent is its own Slack identity: an app created via the App Manifest API (`scripts/slack-app-create.mjs`), events pointed straight at this deployment's Mastra webhook (no shared app, no event router). The agent ships with only `SLACK_SIGNING_SECRET`; the bot token arrives when the client clicks "Add to Slack" and lives in agent-account metadata beside the allowlist and BYOK key (`getSlackBotToken`, `src/lib/identity.ts`). One manual step per app: Activate Public Distribution (UI-only). See `docs/slack-setup.md`.
- **Config seam.** Every per-client value lives in `template.config.ts` (agent identity, model, toolkits, workspace repo, skills). The onboarding app mirrors the toolkit list via the `COMPOSIO_TOOLKITS` env var.

## Endpoint shapes (per deployment)

- Agent API: `https://<slug>-agent.server.mastra.cloud/api/agents/<agent-id>/generate`
- Memory request shape: `{"messages": [...], "memory": {"thread": "<id>", "resource": "<user>"}}`
- Slack webhook: `https://<slug>-agent.server.mastra.cloud/api/agents/<agent-id>/channels/slack/webhook`
- Onboarding: Vercel project `<slug>-onboarding`

## Secrets

All credentials live in Doppler (`agent-deployment-template`, config per environment). `scripts/worktree-setup.sh` materializes `.env` per worktree; `.env.production` (generated, gitignored) carries the runtime subset to `mastra deploy --env-file`. Var names are inventoried in `.env.example`.
