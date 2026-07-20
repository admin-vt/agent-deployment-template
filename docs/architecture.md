# Architecture — as built

One deployment = one clone of this repo, wired to agency-owned vendor accounts. The PoC deployment (`vt-poc`) is the live reference.

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
  └─ /api/openrouter-key — user's BYOK key, validated against OpenRouter,
       stored in WorkOS user metadata (deployment stays storage-free)
```

## Key mechanics

- **Per-user tool identity.** Composio sessions are created per user id with the deployment's toolkits and that user's ACTIVE connected accounts explicitly bound (`src/lib/composio.ts`). The onboarding surface uses the WorkOS user id as the Composio user id.
- **Sandbox state model.** Sandboxes are ephemeral; `/mnt/files` persists per session only. Durable work goes through the workspace repo via the three idempotent tools (`workspace_init` / `workspace_run` / `workspace_commit`). Commands must tolerate re-execution — the backend occasionally double-dispatches (see verification log V4).
- **BYOK.** End users store their own OpenRouter key via onboarding (WorkOS metadata). The deployment's `OPENROUTER_API_KEY` is a dev/operator key. Per-request key resolution from WorkOS metadata is the wiring point when a client goes live with real users.
- **Config seam.** Every per-client value lives in `template.config.ts` (agent identity, model, toolkits, workspace repo, skills). The onboarding app mirrors the toolkit list via the `COMPOSIO_TOOLKITS` env var.

## Live PoC endpoints

- Agent API: `https://vt-poc-agent.server.mastra.cloud/api/agents/assistant/generate`
- Memory request shape: `{"messages": [...], "memory": {"thread": "<id>", "resource": "<user>"}}`
- Onboarding: Vercel project `vt-poc-onboarding`

## Secrets

All credentials live in Doppler (`agent-deployment-template`, config per environment). `scripts/worktree-setup.sh` materializes `.env` per worktree; `.env.production` (generated, gitignored) carries the runtime subset to `mastra deploy --env-file`. Var names are inventoried in `.env.example`.
