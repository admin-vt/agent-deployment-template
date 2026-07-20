#!/usr/bin/env bash
# Deploy the agent to the Mastra platform (headless).
# Single source of truth for which env vars ship to the runtime — docs and
# the runbook call this instead of repeating the list.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${1:?usage: scripts/deploy.sh <mastra-project-slug>}"

[ -f .env ] || { echo ".env missing — run ./scripts/worktree-setup.sh first" >&2; exit 1; }

# The template is never deployed directly — refuse while placeholders remain.
# Comment-only lines are allowed to mention CHANGE-ME; value lines are not.
placeholders="$(grep -n 'CHANGE-ME' template.config.ts | grep -vE '^[0-9]+:\s*(\*|//|/\*)' || true)"
if [ -n "$placeholders" ]; then
  echo "template.config.ts still contains CHANGE-ME placeholders — fill in the per-client values first:" >&2
  echo "$placeholders" >&2
  exit 1
fi

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

# Stale-bundle guard (verified): mastra deploy re-ships an existing
# .mastra/output bundle without rebuilding changed sources.
rm -rf .mastra

mastra deploy --project "$PROJECT" -y --env-file .env.production
