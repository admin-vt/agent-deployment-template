# Verification Log

Evidence for the template's verification checklist (V1–V5, from the original implementation plan, since retired). All runs live against real services, 2026-07-19.

> **vt-poc decommissioned (2026-07-20).** The PoC deployment this log's evidence came from was torn down so the template is purely a template: Mastra project, Vercel `vt-poc-onboarding`, Composio project `pr_JrvfUKawth5X`, and the WorkOS agent user deleted; Slack bot token revoked; vt-poc secrets removed from the template Doppler project. The *findings* below remain valid vendor knowledge — only the deployment is gone. The next runbook-produced deployment is the living reference.

## V1 — Mastra Hosted persistence — PASS
- Deployed to Mastra platform (`vt-poc-agent.server.mastra.cloud`) with a `Memory` instance attached to the agent (`@mastra/memory`, `lastMessages: 20`). The platform provisions hosted storage automatically — no database in the repo, confirming D8.
- Stored a fact in thread `v1-test-2` in one HTTP request; a **separate** request with the same `memory: { thread, resource }` params recalled it verbatim.
- **Finding:** memory requires an explicit `Memory` instance on the agent — `threadId` params alone do nothing. Local `mastra dev` without configured storage falls back to non-durable in-memory storage (fine for dev).
- **Finding:** the request param shape is `memory: { thread, resource }` (top-level `threadId`/`resourceId` are legacy).

## V2 — Mastra native Slack integration — PASS (2026-07-20)
- Live end-to-end on vt-poc: Slack app created from manifest, installed to the VT workspace, credentials deployed, and the agent **answering real messages in Slack**. Full recipe in `docs/slack-setup.md`.
- Webhook signature enforcement confirmed: unsigned POST to the webhook route returns 401; signed Slack traffic passes.
- Adapter is conditional on env (`SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET`), so Slack-less deployments are unaffected.
- ~~Per-user identity fields exposed to the agent (for BYOK key mapping): still to characterize when wiring per-user keys.~~ Superseded 2026-07-20 by the identity model (docs/identity-model.md): no per-user keys — one client key on the agent account.

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

## Identity-model migration — verified live (2026-07-20)
- vt-poc redeployed on the agent-account model: Composio session + workspace tools scope to the single agent account (`WORKOS_AGENT_USER_ID`); Firecrawl search verified end-to-end under the new identity.
- Dynamic BYOK model resolution active (`model: async () => ({id, apiKey})`) — client key from agent-account metadata when set, dev key fallback observed working.
- Onboarding agent console live (tools / model key / allowlist editor), allowlist seeded.
- Slack allowlist guard deployed. **Pending operator step:** existing Slack app needs `users:read.email` added + reinstall; until then senders get the in-band "couldn't verify identity" diagnostic.

## Per-deployment Slack app + "Add to Slack" install — BUILT, doc-sourced, EMPIRICAL VERIFICATION PENDING (2026-07-20)

Implemented: `scripts/slack-app-create.mjs` (App Manifest API creation), onboarding `/api/slack/install` + `/api/slack/callback` (OAuth v2 install, token → agent-account metadata), dynamic bot-token resolution in the agent (`getSlackBotToken`; adapter attaches on `SLACK_SIGNING_SECRET` alone, `botToken` as async resolver — `@chat-adapter/slack` 4.34.0 invokes it per call, and its startup `auth.test` failure is caught, warn-only; verified by reading the shipped dist).

Doc-sourced claims to verify live (docs.slack.dev, fetched 2026-07-20):
- Unlisted distributed apps install into foreign workspaces with **no Marketplace review** — just the distribution checklist + "Activate Public Distribution" (UI-only; no API found). One OAuth doc page claimed Marketplace listing is required for public distribution; the dedicated distribution page contradicts it and is presumed authoritative.
- `apps.manifest.create` (config-token auth) returns `client_id`/`client_secret`/`signing_secret` in the response; config tokens expire in 12h, refresh via `tooling.tokens.rotate`, refresh tokens single-use.
- `oauth.v2.access` returns the workspace bot token + `team.id` on install.
- Agent messaging experience: manifest `features.agent_view.agent_description` (new apps cannot use the deprecated `assistant_view`), scope `assistant:write`, events `app_home_opened` + `app_context_changed` + `message.im`. Unlocks `assistant.threads.setStatus` (thinking indicator w/ rotating loading messages), `setSuggestedPrompts`, `setTitle`, and `chat.startStream` streaming. Adapter (`@chat-adapter/slack` 4.34.0) supports it via `agentView: true`; wired with loadingMessages + suggestedPrompts from `template.config.ts` → `slack`.

Verification plan: run the script against a throwaway app, activate distribution, install into a second workspace we control, confirm the token lands in metadata and the agent answers. Not yet run.

## Per-agent Composio project isolation — LIVE (2026-07-20)
- vt-poc migrated to its own Composio project (`pr_JrvfUKawth5X`), provisioned programmatically: `POST /api/v3.1/org/owner/project/new` with `x-org-api-key` (Organization Access Token) and `should_create_api_key: true` returns the project + its API key in one call.
- Firecrawl auth config + agent-account connected account recreated inside the new project; agent + onboarding redeployed on the project key; live search verified end-to-end.
- The original shared project (`shawn_workspace_first_project`) no longer serves any deployment; its key is retained in Doppler as `COMPOSIO_WORKSPACE_PROJECT_KEY`.
- **API path gotcha (verified):** org endpoints are `/api/v3.1/org/owner/*`; the `/v3.1/org/projects` path appearing in some docs 404s to the dashboard app.
