---
name: stack-docs
description: Where to find authoritative, LLM-accessible documentation for every piece of this template's stack (Mastra, Composio, OpenRouter, WorkOS, Slack, Vercel, Firecrawl, Doppler, Agent Skills). Use whenever implementing, debugging, or upgrading any stack piece — always build from these docs, never from memory.
---

# Stack documentation sources

Every vendor in this stack ships an `llms.txt` index. Workflow: fetch the vendor's `llms.txt` first to find the relevant page, then fetch the specific page. All links verified live 2026-07-19.

| Piece | Docs site | LLM index | Notes |
|---|---|---|---|
| **Mastra** | https://mastra.ai/docs | https://mastra.ai/llms.txt | Framework + Mastra platform (hosted). Key areas: `docs/mastra-platform/*` (server, github, deploys), `reference/cli/mastra` (CLI incl. `mastra auth`, `mastra deploy`), agents/tools/memory guides. |
| **Composio** | https://docs.composio.dev | https://docs.composio.dev/llms.txt (index) · https://docs.composio.dev/llms-full.txt (full, ~700KB) | Key areas: `providers/mastra` (Mastra integration), `authenticating-tools` (connected accounts), `custom-tools`, `sandbox/remote` (Remote Sandbox). API base: `https://backend.composio.dev/api/v3`, auth header `x-api-key` (project key). Org endpoints (project provisioning): `/api/v3.1/org/owner/*` with `x-org-api-key` (Organization Access Token) — the `/v3.1/org/projects` path in some doc examples 404s (verified 2026-07-20). |
| **OpenRouter** | https://openrouter.ai/docs | https://openrouter.ai/docs/llms.txt · llms-full.txt (~3MB) | Key areas: API keys, OAuth PKCE (end-user sign-in for BYOK), provisioning keys, usage accounting. Key-info endpoint: `GET /api/v1/key`. |
| **WorkOS** | https://workos.com/docs | https://workos.com/docs/llms.txt | AuthKit + User Management; Next.js quickstart. API base: `https://api.workos.com`, Bearer auth. |
| **Slack** | https://docs.slack.dev | https://docs.slack.dev/llms.txt · https://api.slack.com/llms.txt | Only needed at surface-install time; Mastra's integration layer handles the app mechanics. |
| **Vercel** | https://vercel.com/docs | https://vercel.com/docs/llms.txt | Deploys, env vars, CLI. CLI is authed on this VPS. |
| **Firecrawl** | https://docs.firecrawl.dev | https://docs.firecrawl.dev/llms.txt | The PoC tool's underlying API (search/scrape). Used through Composio's `firecrawl` toolkit; direct API base `https://api.firecrawl.dev/v1`, Bearer auth. |
| **Doppler** | https://docs.doppler.com | https://docs.doppler.com/llms.txt | Secrets workflow + CLI reference. |
| **Agent Skills** | https://agentskills.io | https://agentskills.io/llms.txt | The `SKILL.md` spec that `/skills/` files follow. |

## Rules

1. **Build from the docs, not from memory.** Model knowledge of these vendors goes stale in weeks. Before implementing against any vendor API/SDK, fetch its current docs via the index above.
2. **Verify before extending this file.** Add a new vendor row only with links checked live, and date the check.
3. **When docs and SDK behavior disagree**, trust observed behavior, note the discrepancy in `docs/verification-log.md`.
