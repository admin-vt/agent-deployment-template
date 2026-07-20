# Customizing a deployment

Everything client-specific starts in `template.config.ts`. The runbook gets a skeleton live; this guide covers the per-case work after.

## Add a skill

Create `skills/<name>/SKILL.md` (agentskills.io format — frontmatter `name` + `description`, body = instructions), then add `'./skills/<name>'` to `templateConfig.skills`. Redeploy. Skills are the per-client IP layer; keep them in the standard format so they survive any framework move. The shipped `skills/workspace` is the worked example of the format (a prior `web-research` example lives in git history).

## Enable a Composio toolkit

The template ships with **no toolkits enabled** — every tool is a deliberate per-client grant, and content-ingesting tools (web search, email, docs) deserve particular thought: whatever they read, the agent reads, so they widen the prompt-injection surface for everyone on the allowlist.

1. Add the slug to `templateConfig.composio.toolkits` and the `COMPOSIO_TOOLKITS` env var on the onboarding app (comma-separated).
2. Ensure an auth config exists for the toolkit *inside this deployment's Composio project* — runbook §3 has ready-to-run snippets for both variants.
   - **OAuth toolkits** (ClickUp, Gmail, Notion, …): create with `{ type: 'use_composio_managed_auth' }`; the credential holder then authorizes via the onboarding page's Connect Link flow.
   - **API-key toolkits**: create with `{ type: 'use_custom_auth', authScheme: 'API_KEY', credentials: {...} }`; either the holder supplies a key through a Connect Link, or the operator provides one server-side (see the Firecrawl branch in `onboarding/app/api/connections/route.ts`).
3. Redeploy both apps. The agent picks up tools through its session automatically.

## Change the model

Set `templateConfig.model` to any `openrouter/<provider>/<model>` string. Model choice is per deployment (and can be made per agent by adding more agents). BYOK note: free-tier OpenRouter accounts only reach `:free` models — real deployments should hold a funded account or user keys.

## Add a chat surface (Slack etc.)

Slack is wired into the template: each deployment gets its own Slack app, created programmatically by `scripts/slack-app-create.mjs`, and the client installs it themselves with the onboarding console's **Add to Slack** button — full flow in `docs/slack-setup.md`. The adapter activates once `SLACK_SIGNING_SECRET` exists; the bot token arrives at install time via agent-account metadata (no redeploy). Other surfaces attach through the same Mastra channel-adapter layer (`channels.adapters` on the agent); see Mastra's channels docs via the stack-docs skill.

## Customize the Slack presentation

`template.config.ts` → `slack` holds the agent-view presentation: `displayName`/`handle`/`description` (the app's Slack identity, read by `scripts/slack-app-create.mjs` at creation), `loadingMessages` (rotating "thinking" status lines), and `suggestedPrompts` (up to 4 clickable prompts pinned when a thread opens). Prompts and loading messages apply on redeploy; identity changes after the app exists are edited in the Slack app settings (or via `apps.manifest.update`).

## Give the agent a different workspace repo

Create a private repo, set `templateConfig.workspace.repo`, ensure the deployment's `GITHUB_TOKEN` can push to it. For client deployments prefer a fine-grained PAT (or deploy key) scoped to that single repo over a broad account token.

## New environment (stg/prd)

Doppler configs `stg`/`prd` mirror `dev`. `DOPPLER_CONFIG=prd ./scripts/worktree-setup.sh` materializes the env; `mastra deploy --env <name>` targets the platform environment.
