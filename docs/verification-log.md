# Verification Log

Evidence for the Phase 2 checklist in `IMPLEMENTATION-PLAN.md`. All runs live against real services, 2026-07-19.

## V1 — Mastra Hosted persistence — PASS
- Deployed to Mastra platform (`vt-poc-agent.server.mastra.cloud`) with a `Memory` instance attached to the agent (`@mastra/memory`, `lastMessages: 20`). The platform provisions hosted storage automatically — no database in the repo, confirming D8.
- Stored a fact in thread `v1-test-2` in one HTTP request; a **separate** request with the same `memory: { thread, resource }` params recalled it verbatim.
- **Finding:** memory requires an explicit `Memory` instance on the agent — `threadId` params alone do nothing. Local `mastra dev` without configured storage falls back to non-durable in-memory storage (fine for dev).
- **Finding:** the request param shape is `memory: { thread, resource }` (top-level `threadId`/`resourceId` are legacy).

## V2 — Mastra native Slack integration
**Status: doc-verified; install deferred** (Slack workspace to be provided later).
- Mastra ships a native Slack channel: `@chat-adapter/slack`, wired via `channels: { adapters: { slack: createSlackAdapter() } }` on the agent, webhook route `/api/agents/<agent-id>/channels/slack/webhook`, env `SLACK_SIGNING_SECRET` + `SLACK_BOT_TOKEN`. Source: mastra.ai/docs/capabilities/channels/slack.
- Additional channel adapters exist under the same layer (see Mastra channels overview).
- Per-user identity fields exposed to the agent: not documented; determine at install time.

## V3 — Composio Firecrawl execution — PASS
- Auth config created programmatically: `composio.authConfigs.create('firecrawl', { type: 'use_custom_auth', authScheme: 'API_KEY', credentials: { api_key } })`.
- Connected account created for user `vt-poc-user` via `connectedAccounts.initiate` with `AuthScheme.APIKey`.
- Real search executed end-to-end through a tool-router session: `FIRECRAWL_SEARCH` returned live results (`creditsUsed: 2`).
- **Finding:** sessions must be created with the toolkit bound — `composio.create(userId, { toolkits: ['firecrawl'], connectedAccounts: { firecrawl: <accountId> } })`. A bare `composio.create(userId)` session does not see the user's connections.
- **Finding:** a dangling `INITIATED` connected account shadows an `ACTIVE` one for the same toolkit; stale non-ACTIVE accounts should be deleted before session creation.

## V4 — Composio Remote Sandbox git loop — PASS (with caveat)
- Environment: git 2.47.3, Node 20, Python 3.13, outbound network open (HTTPS to api.github.com: 200). Sandbox tool: `COMPOSIO_REMOTE_BASH_TOOL` via `session.execute()`.
- Full loop proven: cloned a private GitHub repo (token auth) into `/mnt/files`, wrote a file, committed, pushed — commit and file content confirmed on GitHub (`admin-vt/sandbox-v4-test`, commit "V4 spike: sandbox git loop").
- **Caveat (important):** commands are occasionally dispatched twice concurrently by the Composio backend — observed racing duplicate executions (git lock errors, "already exists" on fresh paths) while one duplicate completed successfully. **All sandbox commands must be idempotent and lock-tolerant.** The template's workspace tools are written accordingly.
- `/mnt/files` persists within a session; treat the workspace git repo as the only durable state.

## V5 — OpenRouter BYOK — MECHANISM VERIFIED, full A/B pending
- Dev key verified via `GET /api/v1/key` (200, usage attribution visible).
- Real completion executed through OpenRouter (free-tier model) with usage attributed to the calling key.
- **Pending:** the two-account A/B (operator key vs. second user's key, observing each balance debit its own account) requires credits on the account and a second account. Run before first client relies on BYOK.

## Firecrawl direct API — PASS
- `POST /v1/search` with the stored key returned live results (200).
