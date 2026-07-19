# Agent Deployment Template — Technical Implementation Plan

**Companion to:** `REQUIREMENTS.md` (the authority on scope and decisions)
**Date:** 19 July 2026

Sequence: set up accounts → gather the docs → verify the load-bearing pieces → build the PoC as if for a client → extract the template → prove the runbook by running it twice. Phases are ordered by dependency; after the verification phase, the rest is assembly of confirmed parts.

---

## Development environment & secrets

Build sessions run on a VT VPS, accessed remotely through **Orca**. Orca creates a **fresh git worktree per session**, so local env state never survives between sessions — secrets live in **Doppler** and every worktree pulls them on creation.

- **Doppler project:** `agent-deployment-template` (workplace `vt`), configs `dev` / `stg` / `prd`. All credentials for the stack go here via the Doppler CLI (`doppler secrets set NAME --project agent-deployment-template --config dev`); nothing secret is ever committed.
- **Worktree setup:** `scripts/worktree-setup.sh` — Orca runs it in each new worktree (safe to re-run manually). It binds the directory to the Doppler project and writes the current secrets to a local `.env` (gitignored, mode 600). Override the config with `DOPPLER_CONFIG=stg ./scripts/worktree-setup.sh`.
- **Adding a credential:** set it in Doppler, then re-run the setup script in any worktree that needs it.

---

## Phase 0 — Accounts & access

All agency-owned (D9), one-time setup.

| Account | Purpose |
|---|---|
| Mastra Hosted | Runs every agent; one org, one project per deployment |
| Composio | The entire tool layer: catalog, per-user auth, execution, Remote Sandbox |
| WorkOS | AuthKit login for onboarding surfaces; one org, per-deployment app |
| OpenRouter | One dev key for building and testing; end users bring their own |
| Slack workspace | VT workspace for the PoC; client deployments install into the client's workspace |
| GitHub (VT org) | Template repo, per-deployment clones, per-agent workspace repos |
| Vercel | Hosts the onboarding surface |

**Exit:** every credential exists and is stored in the Doppler project (`agent-deployment-template/dev`), with the variable names listed in `.env.example`.

---

## Phase 1 — Stack docs skill

Before implementation, locate the authoritative, LLM-accessible documentation source for each stack piece and record it as a repo-scoped Claude Code skill at `.claude/skills/stack-docs/SKILL.md`. Every subsequent phase implements its piece by pulling from these sources.

For each vendor, find and verify (at build time — links checked live, formats confirmed):

| Piece | What to locate |
|---|---|
| Mastra | Docs site + `llms.txt` / `llms-full.txt` endpoint; Hosted deployment guide; native integrations (Slack) guide; skills loading |
| Composio | Docs site + LLM endpoint; Mastra provider guide; connected-accounts/auth flow; tool execution; Firecrawl toolkit actions; Remote Sandbox reference |
| OpenRouter | Docs + LLM endpoint; BYOK / user key provisioning; usage & billing reference |
| WorkOS | AuthKit quickstart + API reference; Next.js integration guide |
| Slack | Bot/app basics relevant to Mastra's integration (workspace install, scopes) |
| Vercel | Deployment + env management docs |
| Agent Skills | agentskills.io `SKILL.md` spec |

The skill records, per vendor: the canonical docs URL, the LLM-friendly endpoint (llms.txt or equivalent), and the specific pages relevant to this template.

**Exit:** `.claude/skills/stack-docs/SKILL.md` committed with live, verified links.

---

## Phase 2 — Verification checklist

Confirm the pieces the design rests on, each with logged evidence in `docs/verification-log.md`, before the build leans on them. Run in parallel where convenient; use the stack-docs sources throughout.

- **V1 — Mastra Hosted persistence:** hold a multi-turn conversation with a throwaway Mastra Hosted agent; confirm thread history and memory survive across sessions. Confirms D8.
- **V2 — Mastra native Slack integration:** connect the throwaway agent to the VT Slack workspace via Mastra's integration; confirm message receipt, in-thread replies, and identify the per-user identity fields exposed (used to map a Slack user to their Composio connections and OpenRouter key). Enumerate the other surfaces the same layer offers, for the docs.
- **V3 — Composio Firecrawl execution:** from a Mastra agent, execute a real Firecrawl search action through Composio and get results back end-to-end.
- **V4 — Composio Remote Sandbox git loop:** inside a sandbox session, clone a private VT repo with an injected token, install a package, make an outbound network call, write files, and push back. This is the exact loop the workspace-repo pattern runs on.
- **V5 — OpenRouter BYOK two-account test:** run the same agent call under the operator dev key and under a second account's key; confirm each call debits only its own account's balance.

**Exit:** all five confirmed and logged.

---

## Phase 3 — Build the PoC agent (as if for a client)

Everything in this phase is written the way a client deployment will receive it — clean structure, pinned versions, per-client values isolated in config.

### 3.1 Repo skeleton

```
/agent/                       # Mastra agent definition: instructions, model config, Composio tool registration
/skills/                      # SKILL.md skills — PoC ships web-research
/lib/sandbox/                 # Sandbox session + workspace-repo lifecycle (open → clone → work → push)
/onboarding/                  # WorkOS-gated web surface (Vercel): connect tools, set up OpenRouter
/runbook/                     # Claude Code runbook skill (built in Phase 5)
/.claude/skills/stack-docs/   # Where each vendor's docs live (from Phase 1)
/docs/                        # Architecture, customization guide, verification log
template.config.*             # Every per-client value in ONE place (names, workspace, tools, models)
```

### 3.2 Agent core (Mastra Hosted)
- Mastra project per deployment; agent defined in-repo, deployed to Mastra Hosted.
- Model routing via OpenRouter (D2): default model set in `template.config`, switchable per client and per agent.
- **BYOK resolution (D3):** each request runs on the end user's OpenRouter key, resolved from the identity the Slack integration provides (per V2). Paste-a-key via the onboarding page is the baseline; OpenRouter sign-in flow per V5's tested path.
- Skills loaded from `/skills/` as standard `SKILL.md` (D11), per the Mastra docs.

### 3.3 Composio tool layer (D4)
- Composio's Mastra provider registers tools directly on the agent — the SDK used natively, full capability.
- PoC toolset: **Firecrawl** (arbitrary web search/fetch).
- Per-user connected accounts: the onboarding page surfaces Composio auth links; the agent executes tools as the connected user.
- Adding a tool for a future client = enabling it in Composio and registering it in `template.config` — catalog-wide, no custom connector code.

### 3.4 Web-research skill (`/skills/web-research/`)
One `SKILL.md` teaching the agent to run a good arbitrary search with the Firecrawl tool: query strategy, search vs. fetch, and how to present sourced answers. Doubles as the template's worked example of the skills layer.

### 3.5 Sandbox + workspace repo (`/lib/sandbox/`) (D5)
- Per-deployment **workspace repo** created in the VT GitHub org — the agent's persistent filesystem.
- Session lifecycle: open Composio Remote Sandbox session → clone workspace repo (scoped deploy token) → agent works → commit/push results → session ends, state lives in git.
- Exposed to the agent as a small tool set: `run_command`, `read_workspace`, `write_workspace`, `commit_workspace`.

### 3.6 Onboarding surface (`/onboarding/`)
Minimal Next.js app on Vercel, WorkOS AuthKit-gated (D7). A signed-in user: connects tool accounts via Composio auth links, sets up their OpenRouter key/sign-in, and sees connection status. Maps their identity to their Slack user so the agent resolves tokens and keys at request time.

### 3.7 Slack surface
Mastra's native Slack integration (per V2), installed into the VT workspace. In-thread replies; conversation state on Mastra Hosted (D8).

**Exit — PoC live:** Slack question → Firecrawl-backed answer; one sandbox task persisted to the workspace repo; model spend visibly debiting the connected user's own OpenRouter account.

---

## Phase 4 — Template extraction

- Sweep every VT/PoC-specific value into `template.config` + env; grep-clean the rest of the tree.
- Mark the repo as a **GitHub template repo**.
- Pin everything: lockfile committed, SDK versions exact, the pinned set recorded in the runbook.
- Docs: the deployment anatomy as-built, and the per-client customization guide — adding skills, enabling Composio tools, adding surfaces.
- The web-research skill stays in the template as the worked example (D11).

**Exit:** a fresh clone contains per-client values only in `template.config`, and the docs stand alone.

---

## Phase 5 — Runbook + re-prove

### 5.1 The runbook (`/runbook/`)
A Claude Code skill that takes a fresh clone to **skeleton agent live in Slack** (D10):

1. Collect per-client values → fill `template.config`.
2. Provision: Mastra Hosted project, Composio project, WorkOS app, workspace repo — all inside VT-owned accounts (D9).
3. Deploy the agent and onboarding surface; install the Slack integration into the target workspace.
4. Verify with scripted checks: Slack round-trip answers, onboarding auth works, a Composio tool executes, a sandbox session opens and pushes to the workspace repo.

Per-client agent design (skills, tools, instructions) begins after the runbook completes, per case.

### 5.2 Re-prove (acceptance criterion 2)
Execute the runbook a second time from a truly fresh clone → second skeleton agent live in Slack. Each friction point found becomes a runbook fix, confirmed in place. This run is the evidence that "reusable" is fact.

**Exit:** both `REQUIREMENTS.md` acceptance criteria hold. **V1 done.**
