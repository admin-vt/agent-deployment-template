#!/usr/bin/env node
/**
 * Create this deployment's Slack app programmatically (apps.manifest.create)
 * and store its credentials in the deployment's Doppler project. Replaces the
 * manual manifest-paste flow in docs/slack-setup.md.
 *
 * Auth: a Slack app configuration token, held as a refresh token in the
 * template Doppler project (SLACK_CONFIG_REFRESH_TOKEN — generated once at
 * https://api.slack.com/reference/manifests#config-tokens, "Generate Token").
 * Config tokens expire after 12h, so every run rotates via
 * tooling.tokens.rotate and persists the new refresh token BEFORE using the
 * access token — rotation invalidates the old refresh token, and losing the
 * new one means regenerating in the Slack UI.
 *
 * App identity (name / handle / description) and the agent id come from
 * template.config.ts (the config seam); bot scopes from /slack-bot-scopes.json
 * (shared with the onboarding install route). CLI flags override any of them.
 *
 * Usage (from a deployment clone, .env populated, template.config.ts filled):
 *   node scripts/slack-app-create.mjs \
 *     --project acme-agent \
 *     --onboarding-url https://acme-onboarding.vercel.app \
 *     --doppler-project acme-agent
 *
 * Remaining manual step (no API for it): open the printed app-settings URL →
 * Manage Distribution → complete the checklist → Activate Public Distribution.
 * Until then the "Add to Slack" button only works for the app's home workspace.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Node 24 type-strips template.config.ts on import — no build step needed.
const { templateConfig } = await import(new URL('../template.config.ts', import.meta.url));
const botScopes = JSON.parse(readFileSync(new URL('../slack-bot-scopes.json', import.meta.url), 'utf8'));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, tok, i, all) => {
    if (tok.startsWith('--')) pairs.push([tok.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);

args.name ??= templateConfig.slack.displayName;
args.handle ??= templateConfig.slack.handle;
args.description ??= templateConfig.slack.description;
args['agent-id'] ??= templateConfig.agent.id;

const required = ['name', 'handle', 'project', 'agent-id', 'onboarding-url', 'doppler-project'];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`Missing args: ${missing.map((k) => `--${k}`).join(' ')}`);
  process.exit(1);
}
const placeholders = [...required, 'description'].filter((k) => String(args[k]).includes('CHANGE-ME'));
if (placeholders.length) {
  console.error(
    `Placeholder values still present (${placeholders.map((k) => `--${k}`).join(', ')}) — fill in template.config.ts first.`,
  );
  process.exit(1);
}

const DOPPLER_CONFIG = process.env.DOPPLER_CONFIG || 'dev';
// The config token lives in the template (operator) Doppler project, shared
// across deployments — like COMPOSIO_ORG_API_KEY.
const TOKEN_PROJECT = args['config-token-project'] || 'agent-deployment-template';

function doppler(cmdArgs) {
  return execFileSync('doppler', cmdArgs, { encoding: 'utf8' }).trim();
}

async function slack(method, body, token) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`${method} failed: ${data.error}${data.errors ? ' ' + JSON.stringify(data.errors) : ''}`);
  }
  return data;
}

// --- 1. Rotate the config token (12h expiry; refresh tokens are single-use) ---
const refreshToken =
  process.env.SLACK_CONFIG_REFRESH_TOKEN ||
  doppler(['secrets', 'get', 'SLACK_CONFIG_REFRESH_TOKEN', '--plain', '--project', TOKEN_PROJECT, '--config', DOPPLER_CONFIG]);

// tooling.tokens.rotate takes form encoding, not JSON
const rotateRes = await fetch(
  `https://slack.com/api/tooling.tokens.rotate?refresh_token=${encodeURIComponent(refreshToken)}`,
  { method: 'POST' },
);
const rotated = await rotateRes.json();
if (!rotated.ok) {
  throw new Error(
    `tooling.tokens.rotate failed: ${rotated.error} — if the refresh token is stale/consumed, regenerate at https://api.slack.com/apps → Your App Configuration Tokens, then doppler secrets set SLACK_CONFIG_REFRESH_TOKEN --project ${TOKEN_PROJECT}`,
  );
}
doppler(['secrets', 'set', `SLACK_CONFIG_REFRESH_TOKEN=${rotated.refresh_token}`, '--project', TOKEN_PROJECT, '--config', DOPPLER_CONFIG, '--silent']);
console.log('Config token rotated; new refresh token persisted to Doppler.');

// --- 2. Create the app from the manifest ---
const webhookUrl = `https://${args.project}.server.mastra.cloud/api/agents/${args['agent-id']}/channels/slack/webhook`;
const redirectUrl = `${args['onboarding-url'].replace(/\/$/, '')}/api/slack/callback`;

// agent_view enables Slack's Agent messaging experience (status/loading
// indicators, suggested prompts, native streaming, thread titles) — new apps
// can only use agent_view; assistant_view is deprecated. It requires the
// assistant:write scope and the app_home_opened + app_context_changed events;
// the adapter side is `agentView: true` (src/mastra/agents/assistant.ts).
const manifest = {
  display_information: { name: args.name },
  features: {
    agent_view: {
      // Max 300 chars, shown under the agent's name in the agent view.
      agent_description: (args.description || `${args.name} — an AI agent for your team.`).slice(0, 300),
    },
    app_home: {
      home_tab_enabled: false,
      messages_tab_enabled: true,
      messages_tab_read_only_enabled: false,
    },
    bot_user: { display_name: args.handle, always_online: true },
  },
  oauth_config: {
    redirect_urls: [redirectUrl],
    scopes: { bot: botScopes },
  },
  settings: {
    event_subscriptions: {
      request_url: webhookUrl,
      bot_events: ['app_mention', 'message.channels', 'message.im', 'app_home_opened', 'app_context_changed'],
    },
    interactivity: { is_enabled: true, request_url: webhookUrl },
    org_deploy_enabled: false,
    socket_mode_enabled: false,
    token_rotation_enabled: false,
  },
};

const created = await slack('apps.manifest.create', { manifest: JSON.stringify(manifest) }, rotated.token);
const { app_id, credentials } = created;
console.log(`Slack app created: ${app_id}`);

// --- 3. Store deployment credentials ---
for (const [name, value] of [
  ['SLACK_CLIENT_ID', credentials.client_id],
  ['SLACK_CLIENT_SECRET', credentials.client_secret],
  ['SLACK_SIGNING_SECRET', credentials.signing_secret],
  ['SLACK_APP_ID', app_id],
]) {
  doppler(['secrets', 'set', `${name}=${value}`, '--project', args['doppler-project'], '--config', DOPPLER_CONFIG, '--silent']);
}
console.log(`Credentials stored in Doppler project ${args['doppler-project']} (${DOPPLER_CONFIG}).`);

console.log(`
Next steps:
  1. MANUAL (UI-only, ~10s): https://api.slack.com/apps/${app_id}/distribute
     → complete the checklist → Activate Public Distribution.
  2. Redeploy the agent with SLACK_SIGNING_SECRET (rerun ./scripts/worktree-setup.sh first).
  3. Set SLACK_CLIENT_ID + SLACK_CLIENT_SECRET on the onboarding Vercel project and redeploy.
  4. The client installs via "Add to Slack" on the onboarding console.
`);
