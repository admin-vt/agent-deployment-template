#!/usr/bin/env bash
# Deploy the agent to the Mastra platform (headless).
# Single source of truth for which env vars ship to the runtime — docs and
# the runbook call this instead of repeating the list.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${1:?usage: scripts/deploy.sh <mastra-project-slug>}"

[ -f .env ] || { echo ".env missing — run ./scripts/worktree-setup.sh first" >&2; exit 1; }

# Runtime subset of .env. SLACK_BOT_TOKEN is the legacy fallback for
# manually-installed Slack apps; button-installed tokens live in
# agent-account metadata, not env.
RUNTIME_VARS=(
  COMPOSIO_API_KEY
  OPENROUTER_API_KEY
  GITHUB_TOKEN
  SLACK_SIGNING_SECRET
  SLACK_BOT_TOKEN
  WORKOS_API_KEY
  WORKOS_AGENT_USER_ID
)

pattern="$(IFS='|'; echo "${RUNTIME_VARS[*]}")"
grep -E "^(${pattern})=" .env > .env.production

mastra deploy --project "$PROJECT" -y --env-file .env.production
