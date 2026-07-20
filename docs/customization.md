# Customizing a deployment

Everything client-specific starts in `template.config.ts`. The runbook gets a skeleton live; this guide covers the per-case work after.

## Add a skill

Create `skills/<name>/SKILL.md` (agentskills.io format — frontmatter `name` + `description`, body = instructions), then add `'./skills/<name>'` to `templateConfig.skills`. Redeploy. Skills are the per-client IP layer; keep them in the standard format so they survive any framework move.

## Enable a Composio toolkit

1. Add the slug to `templateConfig.composio.toolkits` and the `COMPOSIO_TOOLKITS` env var on the onboarding app (comma-separated).
2. Ensure an auth config exists for the toolkit (`composio.authConfigs.create(...)` or the Composio dashboard).
   - **OAuth toolkits** (Gmail, Slack, Notion, …): nothing else — users connect via the onboarding page's Connect Link flow.
   - **API-key toolkits**: either users supply their key through a Connect Link, or the operator provides one server-side (see the Firecrawl branch in `onboarding/app/api/connections/route.ts`).
3. Redeploy both apps. The agent picks up tools through its session automatically.

## Change the model

Set `templateConfig.model` to any `openrouter/<provider>/<model>` string. Model choice is per deployment (and can be made per agent by adding more agents). BYOK note: free-tier OpenRouter accounts only reach `:free` models — real deployments should hold a funded account or user keys.

## Add a chat surface (Slack etc.)

Slack is wired into the template and activates when its credentials exist — full working steps (app manifest, install, credentials, verify) in `docs/slack-setup.md`. Other surfaces attach through the same Mastra channel-adapter layer (`channels.adapters` on the agent); see Mastra's channels docs via the stack-docs skill.

## Give the agent a different workspace repo

Create a private repo, set `templateConfig.workspace.repo`, ensure the deployment's `GITHUB_TOKEN` can push to it. For client deployments prefer a fine-grained PAT (or deploy key) scoped to that single repo over a broad account token.

## New environment (stg/prd)

Doppler configs `stg`/`prd` mirror `dev`. `DOPPLER_CONFIG=prd ./scripts/worktree-setup.sh` materializes the env; `mastra deploy --env <name>` targets the platform environment.
