# Slack setup

Per-deployment Slack app (each agent is its own Slack identity), created programmatically via the App Manifest API, installed by the client with an "Add to Slack" button on the onboarding console. One ~10-second browser step remains on our side (activating distribution — Slack has no API for it).

Doc-sourced flow (docs.slack.dev, 2026-07-20); empirical verification pending — see the verification log. The manual flow that was proven live on vt-poc is kept as the fallback appendix below.

## How the pieces fit

- **App credentials** (client id/secret, signing secret) are created with the app by `scripts/slack-app-create.mjs` and live in Doppler. The agent deploys with only `SLACK_SIGNING_SECRET`; that's what makes the adapter attach (`src/mastra/agents/assistant.ts`).
- **The bot token** is not a deploy-time secret. When the client clicks **Add to Slack** on the onboarding console, the OAuth callback (`onboarding/app/api/slack/callback/route.ts`) exchanges the code at `oauth.v2.access` and writes the `xoxb-` token into the agent account's WorkOS metadata (`slackBotToken`), alongside `slackTeamId`/`slackTeamName`/`slackBotUserId`. The agent resolves it per call (`getSlackBotToken` in `src/lib/identity.ts`) — installs and reinstalls need **no redeploy**.
- Pre-install, the adapter's startup `auth.test` fails soft (a warning) and no events arrive anyway.
- Bot scopes are single-sourced in `/slack-bot-scopes.json`, read by both the manifest (`scripts/slack-app-create.mjs`) and the install request (`onboarding/lib/slack.ts`) — the OAuth install must ask for exactly what the app declares.
- **Agent messaging experience** (`features.agent_view` in the manifest — the only mode available to new apps; `assistant_view` is deprecated): unlocks the thinking/status indicator with rotating loading messages, suggested prompts pinned on thread open, native token streaming (`chat.startStream`), and thread titles. Requires the `assistant:write` scope plus the `app_home_opened` and `app_context_changed` events; the adapter side is `agentView: true` in `assistant.ts`. The app's identity and per-client presentation (display name, handle, ≤300-char description, loading messages, suggested prompts) live in `template.config.ts` → `slack`.

## 1. One-time operator prerequisite

A Slack **app configuration token** for the workspace that will own the apps (our workspace — the apps are *distributed* into client workspaces, they don't live there). Generate at [api.slack.com/apps](https://api.slack.com/apps) → **Your App Configuration Tokens** → Generate Token, then store the **refresh token**:

```bash
doppler secrets set SLACK_CONFIG_REFRESH_TOKEN '<xoxe-refresh-...>' --project agent-deployment-template --config dev --silent
```

Config tokens expire after 12h; the creation script rotates via `tooling.tokens.rotate` on every run and persists the new refresh token back to Doppler (refresh tokens are single-use — if a run dies between rotate and persist, regenerate in the UI).

## 2. Create the deployment's app

```bash
node scripts/slack-app-create.mjs \
  --project <slug>-agent \
  --onboarding-url https://<slug>-onboarding.vercel.app \
  --doppler-project <slug>-agent
```

App identity (display name, handle, description) and the agent id are read from `template.config.ts` → `slack` / `agent` (flags `--name`/`--handle`/`--description`/`--agent-id` override); bot scopes from `/slack-bot-scopes.json`. This creates the app from the manifest (events + interactivity pointed at this deployment's webhook `https://<slug>-agent.server.mastra.cloud/api/agents/<agent-id>/channels/slack/webhook`, OAuth redirect registered to the onboarding callback) and stores `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` / `SLACK_APP_ID` in the deployment's Doppler project.

## 3. Activate public distribution (manual, ~10s)

Open `https://api.slack.com/apps/<app-id>/distribute` → complete the checklist → **Activate Public Distribution**. This is what lets workspaces other than ours install the app. Unlisted distribution — **no Marketplace review involved**. No API exists for this step (checked 2026-07-20).

## 4. Deploy with the new credentials

```bash
./scripts/worktree-setup.sh
./scripts/deploy.sh <slug>-agent
```

Onboarding needs the OAuth pair (Vercel env): `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` → `vercel env add` + `vercel deploy --prod --yes`.

## 5. Client installs — the whole client experience

On the onboarding console, section "Add the agent to Slack" → click **Add to Slack** → approve the scopes in their workspace → done; the bot appears. If their workspace restricts app installs, Slack routes an approval request to their admin automatically. Nobody pastes JSON or handles a token.

## 6. Verify

- Console shows "✅ installed in <workspace>".
- Unsigned probe to the webhook returns **401** (signature enforcement live).
- Slack app settings → Event Subscriptions → **Retry** if the URL shows unverified.
- DM the bot from an allowlisted email's account. First real answer closes the loop.

## Allowlist enforcement

Every message is checked against the agent account's Slack allowlist (docs/identity-model.md): sender's Slack user id → email via `users.info` (this is why `users:read.email` is in the scopes) → match against the list. Unlisted senders get a one-line decline pointing to the account holder; missing-scope failures surface in-band with a distinct message.

## Appendix: manual flow (fallback, proven live on vt-poc 2026-07-20)

If the manifest API path is unavailable: create the app by hand at [api.slack.com/apps](https://api.slack.com/apps) → **From a manifest** → **JSON tab** (the dialog defaults to JSON; YAML pasted there fails with "can't translate a manifest with errors") → paste the manifest from `scripts/slack-app-create.mjs` with the placeholders filled → **Install to Workspace** (requires being a member; only works for a workspace you're in). Copy the **Signing Secret** (Basic Information) and **Bot User OAuth Token** (OAuth & Permissions), then:

```bash
doppler secrets set SLACK_BOT_TOKEN='<xoxb-...>' SLACK_SIGNING_SECRET='<secret>' --project <doppler-project> --config dev --silent
```

and deploy as in step 4. `SLACK_BOT_TOKEN` in env is the fallback the runtime uses when no token is in agent-account metadata. If URL verification fails at creation, ignore it — it passes once the agent is deployed. **If an app predates the `users:read.email` scope, add it under OAuth & Permissions and reinstall — otherwise the guard declines everyone.**
