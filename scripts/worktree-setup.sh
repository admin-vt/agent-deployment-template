#!/usr/bin/env bash
# Worktree setup — populates the local env from Doppler.
# Orca runs this in every new worktree; safe to re-run at any time.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="agent-deployment-template"
CONFIG="${DOPPLER_CONFIG:-dev}"

command -v doppler >/dev/null 2>&1 || { echo "doppler CLI not found on this machine" >&2; exit 1; }
doppler me >/dev/null 2>&1 || { echo "doppler CLI not authenticated — run 'doppler login'" >&2; exit 1; }

doppler setup --project "$PROJECT" --config "$CONFIG" --no-interactive >/dev/null
doppler secrets download --no-file --format env > .env
chmod 600 .env

echo "Populated .env from Doppler ($PROJECT/$CONFIG) — $(grep -c '=' .env || true) secrets"
