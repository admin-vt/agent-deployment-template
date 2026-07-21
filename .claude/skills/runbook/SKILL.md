---
name: runbook
description: Stand up a new client agent deployment from a fresh clone of this template — provisioning, config, deploy, verification. Use when creating deployment #N for a new client, or re-proving the template. Takes a fresh clone to "skeleton agent live"; does NOT design the client's agent (skills/tools/instructions are per-case work afterward).
---

# New deployment runbook

Input needed from the operator before starting: **client name**, **slug** (kebab-case), **client owner's email**, **initial Slack allowlist emails**, **Slack app identity** (display name, bot handle, ≤300-char agent description), **default model** (`openrouter/<provider>/<model>`), **toolkits** (Composio slugs), and which **GitHub org** owns the repos. Everything runs headless from this environment; read `stack-docs` for vendor doc sources if anything drifts. Identity model: `docs/identity-model.md` — one agent account per deployment, humans on a Slack allowlist.

## 0. Preflight

```bash
command -v doppler mastra vercel gh   # all must exist
doppler me && mastra auth whoami      # both authed (mastra via MASTRA_API_TOKEN)
```

When anything fails, check `docs/verification-log.md` first — most failure modes you'll hit (sandbox races, endpoint timeouts, stale deploy bundles, vendor API path gotchas) are already characterized there with fixes.

## 1. Clone and configure

```bash
gh repo create <org>/<slug>-agent --private --template admin-vt/agent-deployment-template --clone
cd <slug>-agent
```

Edit `template.config.ts` and replace **every `CHANGE-ME`** (client name/slug, agent name/instructions, workspace repo `<org>/<slug>-agent-workspace`, Slack identity `slack.displayName`/`handle`/`description`), and set model/toolkits/Slack presentation as needed. `scripts/deploy.sh` and `scripts/slack-app-create.mjs` refuse to run while any `CHANGE-ME` remains.

## 2. Secrets (Doppler)

```bash
doppler projects create <slug>-agent
# copy shared operator credentials from the template project, then set per-client ones:
for k in MASTRA_API_TOKEN COMPOSIO_API_KEY OPENROUTER_API_KEY GITHUB_TOKEN FIRECRAWL_API_KEY WORKOS_API_KEY WORKOS_CLIENT_ID; do
  doppler secrets set $k "$(doppler secrets get $k --plain --project agent-deployment-template --config dev)" --project <slug>-agent --config dev --silent
done
doppler secrets set WORKOS_COOKIE_PASSWORD "$(openssl rand -base64 48 | tr -d '\n')" --project <slug>-agent --config dev --silent
sed -i 's/PROJECT="agent-deployment-template"/PROJECT="<slug>-agent"/' scripts/worktree-setup.sh
./scripts/worktree-setup.sh
```

## 3. Provision

```bash
# Workspace repo (the agent's persistent filesystem)
tmp=$(mktemp -d) && cd $tmp && git init -qb main && echo "# <client> agent workspace" > README.md \
  && git add . && git commit -qm "Initialize agent workspace" \
  && gh repo create <org>/<slug>-agent-workspace --private --source=. --push && cd -

# Mastra platform project (REST; CLI needs MASTRA_ORG_ID/MASTRA_PROJECT_ID for token auth)
curl -s -X POST -H "Authorization: Bearer $MASTRA_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<slug>-agent"}' https://platform.mastra.ai/v1/server/projects
# → record project.id and project.organizationId (multi-set requires NAME=VALUE form):
doppler secrets set MASTRA_ORG_ID=<org-id> MASTRA_PROJECT_ID=<project-id> --project <slug>-agent --config dev --silent
./scripts/worktree-setup.sh
```

**Agent account** (the deployment's single identity — all tool auth and the client's model key scope to it):

```bash
# One WorkOS user per agent; email = owner's address plus-tagged with the slug
# (WorkOS emails are unique per environment; plus-addressing keeps resets in the owner's inbox)
PW=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
curl -s -X POST -H "Authorization: Bearer $WORKOS_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"<owner>+<slug>@<domain>","password":"'$PW'","first_name":"<Agent Display Name>","last_name":"(<slug> agent account)","email_verified":true}' \
  https://api.workos.com/user_management/users
# → record the user id, then (multi-set requires NAME=VALUE form):
doppler secrets set WORKOS_AGENT_USER_ID=<user-id> AGENT_ACCOUNT_EMAIL='<owner>+<slug>@<domain>' AGENT_ACCOUNT_PASSWORD="$PW" --project <slug>-agent --config dev --silent

# Seed the Slack allowlist (default closed — nobody talks until listed)
curl -s -X PUT -H "Authorization: Bearer $WORKOS_API_KEY" -H "Content-Type: application/json" \
  -d '{"metadata":{"slackAllowlist":"[\"<owner-email>\",\"<other-initial-emails>\"]"}}' \
  https://api.workos.com/user_management/users/<user-id>
./scripts/worktree-setup.sh
```

**Composio project for this agent** — per-agent tool isolation (docs/identity-model.md), scripted via the org access token (`COMPOSIO_ORG_API_KEY` in the template Doppler project; from dashboard → Organization Settings → Organization Access Tokens):

```bash
curl -s -X POST -H "x-org-api-key: $COMPOSIO_ORG_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"<slug>-agent","should_create_api_key":true}' \
  https://backend.composio.dev/api/v3.1/org/owner/project/new
# → returns {id, name, api_key}; store api_key as this deployment's COMPOSIO_API_KEY:
doppler secrets set COMPOSIO_API_KEY <api_key> --project <slug>-agent --config dev --silent
```

Note: org endpoints live under `/api/v3.1/org/owner/*` with the `x-org-api-key` header — other paths shown in some docs (e.g. `/v3.1/org/projects`) 404.

Composio auth config for each toolkit, created inside this agent's project (`WORKOS_AGENT_USER_ID` is the Composio userId for all sessions). **Every toolkit listed in `templateConfig.composio.toolkits` must have an auth config before you deploy with it** — a listed toolkit without one breaks every `/generate` with `400 ToolRouterV2_BadRequest code 4300` (verified on vt-twitter); binding only ACTIVE connections does not exempt the toolkit list. If a toolkit's auth config can't be created yet (e.g. waiting on client credentials), deploy with `toolkits: []` and add it + redeploy once the config exists.

First check what auth the toolkit actually supports — the "OAuth = Composio-managed" assumption does not hold universally (verified: `twitter` has no managed credentials; managed-auth create fails with code 306 `Auth_Config_DefaultAuthConfigNotFound`):

```bash
node --input-type=module -e "
import { Composio } from '@composio/core';
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const tk = await c.toolkits.get('<toolkit>');
console.log(JSON.stringify(tk.authConfigDetails, null, 2));  // schemes + which fields are required
"
```

Then the matching variant:

```bash
# OAuth toolkits with Composio-managed credentials (clickup, gmail, notion, …);
# the client authorizes later via the onboarding console's Connect Link:
node --input-type=module -e "
import { Composio } from '@composio/core';
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const existing = await c.authConfigs.list({ toolkit: '<toolkit>' });
if (!existing.items?.length) console.log(await c.authConfigs.create('<toolkit>', { type: 'use_composio_managed_auth', name: '<slug>-<toolkit>' }));
"

# API-key toolkits with an operator credential (e.g. firecrawl) — the
# onboarding /api/connections route connects them server-side:
node --input-type=module -e "
import { Composio } from '@composio/core';
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const existing = await c.authConfigs.list({ toolkit: '<toolkit>' });
if (!existing.items?.length) console.log(await c.authConfigs.create('<toolkit>', { type: 'use_custom_auth', authScheme: 'API_KEY', name: '<slug>-<toolkit>', credentials: { api_key: process.env.<TOOLKIT>_API_KEY } }));
"

# OAuth toolkits WITHOUT managed credentials (e.g. twitter) — needs an app on the
# provider's developer platform (client-owned; may require browser signup / paid tier):
node --input-type=module -e "
import { Composio } from '@composio/core';
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const existing = await c.authConfigs.list({ toolkit: '<toolkit>' });
if (!existing.items?.length) console.log(await c.authConfigs.create('<toolkit>', { type: 'use_custom_auth', authScheme: 'OAUTH2', name: '<slug>-<toolkit>', credentials: { client_id: process.env.<TOOLKIT>_CLIENT_ID, client_secret: process.env.<TOOLKIT>_CLIENT_SECRET } }));
"
```

## 4. Deploy the agent

```bash
npm install && npx tsc --noEmit
set -a && source .env && set +a
./scripts/deploy.sh <slug>-agent   # builds .env.production (runtime var list lives in the script) + mastra deploy
```

- **Always deploy through `scripts/deploy.sh`, never raw `mastra deploy`** — the CLI re-ships an existing `.mastra/output` bundle without rebuilding changed sources (verified); the script clears the cache first. A suspiciously fast deploy (<1 min) of changed code means a stale bundle shipped; a genuine build takes ~15 min.
- The deploy log's `No storage configured — falling back to in-memory store` warning is **benign on the platform** — hosted storage is provisioned regardless (memory round-trip verified; see the log).

**Commit and push as you go.** The deployment repo is the record: push the filled config before the first deploy, and push every code change the deployment runs — deployed state must never exist only in a local worktree (worktrees here are ephemeral).

## 5. Deploy onboarding

The build imports repo-root files (`slack-bot-scopes.json`), so the Vercel project's **Root Directory must be `onboarding` and the deploy must run from the repo root** (verified: a `vercel deploy` from inside `onboarding/` uploads only that directory and the build breaks). No CLI flag sets Root Directory (54.x) — set it once via API:

```bash
cd onboarding && npm install
vercel link --yes --project <slug>-onboarding
# env: WORKOS_API_KEY WORKOS_CLIENT_ID WORKOS_COOKIE_PASSWORD COMPOSIO_API_KEY FIRECRAWL_API_KEY
#      COMPOSIO_TOOLKITS=<toolkits> NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://<slug>-onboarding.vercel.app/callback
printf '%s' "<value>" | vercel env add <NAME> production   # per var
cd ..

pid=$(python3 -c "import json;print(json.load(open('onboarding/.vercel/project.json'))['projectId'])")
team=$(python3 -c "import json;print(json.load(open('onboarding/.vercel/project.json'))['orgId'])")
vtok=$(python3 -c "
import json, os
for p in ('~/.local/share/com.vercel.cli/auth.json', '~/.vercel/auth.json'):
    p = os.path.expanduser(p)
    if os.path.exists(p): print(json.load(open(p))['token']); break
")
curl -s -X PATCH "https://api.vercel.com/v9/projects/$pid?teamId=$team" \
  -H "Authorization: Bearer $vtok" -H "Content-Type: application/json" \
  -d '{"rootDirectory":"onboarding"}' >/dev/null

cp -r onboarding/.vercel .vercel
vercel deploy --prod --yes   # from the repo root
```

Register the callback as a WorkOS redirect URI (API, no dashboard needed):

```bash
curl -s -X POST -H "Authorization: Bearer $WORKOS_API_KEY" -H "Content-Type: application/json" \
  -d '{"uri":"https://<slug>-onboarding.vercel.app/callback"}' \
  https://api.workos.com/user_management/redirect_uris
```

## 6. Verify (scripted checks)

```bash
# Timing (verified): the endpoints sit behind Cloudflare, which 524s at ~100s,
# and any workspace tool call on a cold sandbox takes ~2 min (session + sandbox
# + clone). Use /stream for anything tool-heavy; /generate only for short,
# no-tool turns.
curl -s -X POST https://<slug>-agent.server.mastra.cloud/api/agents/<agent-id>/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Reply with one sentence introducing yourself."}]}'

# Memory round-trip: send a fact with {"memory":{"thread":"t1","resource":"u1"}}, recall it in a second request.

# Workspace loop (use /stream — cold sandbox exceeds the /generate timeout):
# ask the agent to workspace_init, write a file, workspace_commit —
curl -sN -X POST https://<slug>-agent.server.mastra.cloud/api/agents/<agent-id>/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"workspace_init, write hello.txt containing hello, then workspace_commit."}]}' | tail -5
# then confirm the commit: gh api repos/<org>/<slug>-agent-workspace/commits --jq '.[0].commit.message'
# If a toolkit is enabled, exercise it too (e.g. firecrawl: "Use FIRECRAWL_SEARCH
# to find todays top AI news, answer in one sentence.")

# Onboarding serves and gates:
curl -sI https://<slug>-onboarding.vercel.app | head -3   # expect redirect to login
```

## 7. Slack app (before handoff — the client installs it themselves)

Per `docs/slack-setup.md`: create this deployment's own Slack app programmatically, then the client installs it with the onboarding console's "Add to Slack" button — no manifest paste, no credential handback.

```bash
# app identity + agent id read from template.config.ts; scopes from /slack-bot-scopes.json
node scripts/slack-app-create.mjs \
  --project <slug>-agent \
  --onboarding-url https://<slug>-onboarding.vercel.app \
  --doppler-project <slug>-agent
# MANUAL (~10s, no API): https://api.slack.com/apps/<app-id>/distribute → Activate Public Distribution
./scripts/worktree-setup.sh && ./scripts/deploy.sh <slug>-agent   # pick up SLACK_SIGNING_SECRET, redeploy
# onboarding Vercel env: add SLACK_CLIENT_ID + SLACK_CLIENT_SECRET, redeploy (step 5)
```

Needs `SLACK_CONFIG_REFRESH_TOKEN` in the template Doppler project (one-time operator setup — see slack-setup.md §1). The bot token is NOT provisioned here: it lands in agent-account metadata when the client clicks Add to Slack.

## 8. Handoff

Send the client owner: the onboarding link, the agent account credential (`AGENT_ACCOUNT_EMAIL` / `AGENT_ACCOUNT_PASSWORD` from Doppler), and the four-step instruction — sign in, authorize the listed tools, add your OpenRouter key, click **Add to Slack**, manage the allowlist. Everything after this point — the client's real skills, tools, instructions — is per-case design work, not runbook scope.
