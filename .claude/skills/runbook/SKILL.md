---
name: runbook
description: Stand up a new client agent deployment from a fresh clone of this template — provisioning, config, deploy, verification. Use when creating deployment #N for a new client, or re-proving the template. Takes a fresh clone to "skeleton agent live"; does NOT design the client's agent (skills/tools/instructions are per-case work afterward).
---

# New deployment runbook

Input needed from the operator before starting: **client name**, **slug** (kebab-case), **client owner's email**, **initial Slack allowlist emails**, **default model** (`openrouter/<provider>/<model>`), **toolkits** (Composio slugs), and which **GitHub org** owns the repos. Everything runs headless from this environment; read `stack-docs` for vendor doc sources if anything drifts. Identity model: `docs/identity-model.md` — one agent account per deployment, humans on a Slack allowlist.

## 0. Preflight

```bash
command -v doppler mastra vercel gh   # all must exist
doppler me && mastra auth whoami      # both authed (mastra via MASTRA_API_TOKEN)
```

## 1. Clone and configure

```bash
gh repo create <org>/<slug>-agent --private --template admin-vt/agent-deployment-template --clone
cd <slug>-agent
```

Edit `template.config.ts`: client name/slug, agent id/name/instructions, model, toolkits, workspace repo `<org>/<slug>-agent-workspace`, Slack presentation (`slack.loadingMessages` / `slack.suggestedPrompts`).

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
# → record project.id and project.organizationId:
doppler secrets set MASTRA_ORG_ID <org-id> MASTRA_PROJECT_ID <project-id> --project <slug>-agent --config dev --silent
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
# → record the user id, then:
doppler secrets set WORKOS_AGENT_USER_ID <user-id> AGENT_ACCOUNT_EMAIL '<owner>+<slug>@<domain>' AGENT_ACCOUNT_PASSWORD "$PW" --project <slug>-agent --config dev --silent

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

Composio auth configs for each toolkit, created inside this agent's project, and operator-credentialed toolkits connected for the agent account (`WORKOS_AGENT_USER_ID` as the Composio userId):

```bash
node --input-type=module -e "
import { Composio } from '@composio/core';
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const existing = await c.authConfigs.list({ toolkit: '<toolkit>' });
if (!existing.items?.length) console.log(await c.authConfigs.create('<toolkit>', { type: 'use_custom_auth', authScheme: 'API_KEY', name: '<slug>-<toolkit>', credentials: { api_key: process.env.<TOOLKIT>_API_KEY } }));
"
```

## 4. Deploy the agent

```bash
npm install && npx tsc --noEmit
grep -E "^(COMPOSIO_API_KEY|OPENROUTER_API_KEY|GITHUB_TOKEN|SLACK_BOT_TOKEN|SLACK_SIGNING_SECRET|WORKOS_API_KEY|WORKOS_AGENT_USER_ID)=" .env > .env.production
set -a && source .env && set +a
mastra deploy --project <slug>-agent -y --env-file .env.production
```

## 5. Deploy onboarding

```bash
cd onboarding && npm install
vercel link --yes --project <slug>-onboarding
# env: WORKOS_API_KEY WORKOS_CLIENT_ID WORKOS_COOKIE_PASSWORD COMPOSIO_API_KEY FIRECRAWL_API_KEY
#      COMPOSIO_TOOLKITS=<toolkits> NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://<slug>-onboarding.vercel.app/callback
printf '%s' "<value>" | vercel env add <NAME> production   # per var
vercel deploy --prod --yes
```

Register the callback as a WorkOS redirect URI (API, no dashboard needed):

```bash
curl -s -X POST -H "Authorization: Bearer $WORKOS_API_KEY" -H "Content-Type: application/json" \
  -d '{"uri":"https://<slug>-onboarding.vercel.app/callback"}' \
  https://api.workos.com/user_management/redirect_uris
```

## 6. Verify (scripted checks)

```bash
# Agent answers
curl -s -X POST https://<slug>-agent.server.mastra.cloud/api/agents/<agent-id>/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Use FIRECRAWL_SEARCH to find todays top AI news, answer in one sentence."}]}'

# Memory round-trip: send a fact with {"memory":{"thread":"t1","resource":"u1"}}, recall it in a second request.

# Workspace loop: ask the agent to workspace_init, write a file, workspace_commit —
# then confirm the commit: gh api repos/<org>/<slug>-agent-workspace/commits --jq '.[0].commit.message'

# Onboarding serves and gates:
curl -sI https://<slug>-onboarding.vercel.app | head -3   # expect redirect to login
```

## 7. Slack app (before handoff — the client installs it themselves)

Per `docs/slack-setup.md`: create this deployment's own Slack app programmatically, then the client installs it with the onboarding console's "Add to Slack" button — no manifest paste, no credential handback.

```bash
node scripts/slack-app-create.mjs \
  --name "<Agent Display Name>" --handle <agent-handle> \
  --description "<agent description, ≤300 chars>" \
  --project <slug>-agent --agent-id <agent-id> \
  --onboarding-url https://<slug>-onboarding.vercel.app \
  --doppler-project <slug>-agent
# MANUAL (~10s, no API): https://api.slack.com/apps/<app-id>/distribute → Activate Public Distribution
./scripts/worktree-setup.sh   # pick up SLACK_SIGNING_SECRET, then redeploy agent (step 4 grep includes it)
# onboarding Vercel env: add SLACK_CLIENT_ID + SLACK_CLIENT_SECRET, redeploy (step 5)
```

Needs `SLACK_CONFIG_REFRESH_TOKEN` in the template Doppler project (one-time operator setup — see slack-setup.md §1). The bot token is NOT provisioned here: it lands in agent-account metadata when the client clicks Add to Slack.

## 8. Handoff

Send the client owner: the onboarding link, the agent account credential (`AGENT_ACCOUNT_EMAIL` / `AGENT_ACCOUNT_PASSWORD` from Doppler), and the four-step instruction — sign in, authorize the listed tools, add your OpenRouter key, click **Add to Slack**, manage the allowlist. Everything after this point — the client's real skills, tools, instructions — is per-case design work, not runbook scope.
