# Verification Log

Evidence for the Phase 2 checklist in `IMPLEMENTATION-PLAN.md`. All runs live against real services, 2026-07-19.

## V1 — Mastra Hosted persistence — PASS
- Deployed to Mastra platform (`vt-poc-agent.server.mastra.cloud`) with a `Memory` instance attached to the agent (`@mastra/memory`, `lastMessages: 20`). The platform provisions hosted storage automatically — no database in the repo, confirming D8.
- Stored a fact in thread `v1-test-2` in one HTTP request; a **separate** request with the same `memory: { thread, resource }` params recalled it verbatim.
- **Finding:** memory requires an explicit `Memory` instance on the agent — `threadId` params alone do nothing. Local `mastra dev` without configured storage falls back to non-durable in-memory storage (fine for dev).
- **Finding:** the request param shape is `memory: { thread, resource }` (top-level `threadId`/`resourceId` are legacy).

## V2 — Mastra native Slack integration — PASS (2026-07-20)
- Live end-to-end on vt-poc: Slack app created from manifest, installed to the VT workspace, credentials deployed, and the agent **answering real messages in Slack**. Full recipe in `docs/slack-setup.md`.
- Webhook signature enforcement confirmed: unsigned POST to the webhook route returns 401; signed Slack traffic passes.
- Adapter is conditional on env (`SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET`), so Slack-less deployments are unaffected.
- Per-user identity fields exposed to the agent (for BYOK key mapping): still to characterize when wiring per-user keys.

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
- **2026-07-20, after funding the account:** real paid calls (claude-sonnet-4.5 through the deployed agent) debited the key's account — `usage: $0.54` visible on `GET /api/v1/key`. Usage bills the key owner, observed with real spend.
- **Pending:** the two-account A/B (operator key vs. second user's key, each debiting its own balance) requires a second OpenRouter account. Run before the first client relies on BYOK.

## Post-funding model swap + hardening (2026-07-20)
- Default model switched to `openrouter/anthropic/claude-sonnet-4.5`. The free model (`nemotron-3-super:free`) was demonstrably unreliable at multi-step tool chains (empty final texts, wrong-tool wandering); Sonnet 4.5 narrates, chains, and reports failures cleanly.
- Workspace tools hardened after observed sandbox races: stale-lock cleanup (`.git/*.lock`) on init/commit, corrupt-clone detection (`git rev-parse --verify HEAD`) with automatic re-clone.
- **Vendor incident note:** Composio Remote Sandbox degraded on 2026-07-20 ~01:30–02:40 UTC: transport timeouts, hanging git operations, and in-sandbox probes to GitHub returning nothing. Recovered by ~02:40 (probes 200, in-sandbox `git clone` clean). Lesson recorded: treat single-probe diagnoses during an incident as provisional — re-verify across hosts before attributing root cause. Catalog tools (Firecrawl) were unaffected throughout; the agent (Sonnet 4.5) surfaced the degradation gracefully instead of failing silently.
- **Re-prove workspace git-loop — PASS (2026-07-20 02:44 UTC):** after recovery, the proof deployment's workspace loop completed — commit `runbook re-prove` with `proof.txt: proof-run-ok` confirmed on `admin-vt/template-proof-agent-workspace`. All re-prove checks are now green.
- **WorkOS redirect URIs are API-manageable** (`POST /user_management/redirect_uris`) — registered for the PoC onboarding app programmatically; runbook updated to script it (no dashboard step).

## Firecrawl direct API — PASS
- `POST /v1/search` with the stored key returned live results (200).
