# Slack setup

Proven flow (vt-poc, 2026-07-20). ~10 minutes; only the app-creation steps need a browser.

## 1. Code side (already in the template)

The agent wires `createSlackAdapter()` from `@chat-adapter/slack` into `channels.adapters` — see `src/mastra/agents/assistant.ts`. The adapter activates only when `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` exist, so deployments without Slack run unchanged. The webhook route Mastra registers is:

```
https://<project>.server.mastra.cloud/api/agents/<agent-id>/channels/slack/webhook
```

## 2. Create the Slack app (browser, operator)

[api.slack.com/apps](https://api.slack.com/apps) → **Create an app** → **From a manifest** → pick the target workspace → paste the manifest below.

**Gotcha:** the dialog has YAML/JSON tabs and defaults to JSON — pasting YAML there fails with "can't translate a manifest with errors." Use the JSON below on the JSON tab.

```json
{
  "display_information": { "name": "<Agent Display Name>" },
  "features": {
    "app_home": {
      "home_tab_enabled": false,
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    },
    "bot_user": { "display_name": "<agent-handle>", "always_online": true }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "im:write", "app_mentions:read", "channels:history", "channels:read",
        "chat:write", "users:read", "users:read.email", "im:read", "im:history"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://<project>.server.mastra.cloud/api/agents/<agent-id>/channels/slack/webhook",
      "bot_events": ["app_mention", "message.channels", "message.im"]
    },
    "interactivity": {
      "is_enabled": true,
      "request_url": "https://<project>.server.mastra.cloud/api/agents/<agent-id>/channels/slack/webhook"
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

If URL verification fails at creation, ignore it — it passes after step 4.

## 3. Install and collect credentials

**Install App** → **Install to Workspace** → approve. Then copy:
- **Signing Secret** — Basic Information → App Credentials
- **Bot User OAuth Token** (`xoxb-…`) — OAuth & Permissions

## 4. Deploy with credentials

```bash
doppler secrets set SLACK_BOT_TOKEN '<xoxb-...>' SLACK_SIGNING_SECRET '<secret>' --project <doppler-project> --config dev --silent
./scripts/worktree-setup.sh
grep -E "^(COMPOSIO_API_KEY|OPENROUTER_API_KEY|GITHUB_TOKEN|SLACK_BOT_TOKEN|SLACK_SIGNING_SECRET)=" .env > .env.production
mastra deploy --project <project> -y --env-file .env.production
```

## 5. Verify

- Unsigned probe returns **401** (route live, signature enforcement working):
  `curl -X POST <webhook-url> -d '{"type":"url_verification","challenge":"x"}'` → 401
- Slack app settings → Event Subscriptions → **Retry** if the URL shows unverified → turns green.
- DM the bot (or @mention it in a channel) **from an allowlisted email's account**. First real answer closes the loop.

## Allowlist enforcement

Every message is checked against the agent account's Slack allowlist (docs/identity-model.md): sender's Slack user id → email via `users.info` (this is why `users:read.email` is in the manifest) → match against the list. Unlisted senders get a one-line decline pointing to the account holder; missing-scope failures surface in-band with a distinct message. **If an app predates the scope addition, add `users:read.email` under OAuth & Permissions and reinstall the app — otherwise the guard declines everyone.**
