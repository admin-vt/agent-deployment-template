/**
 * Slack install flow constants. The bot scopes MUST stay in sync with the
 * app manifest in scripts/slack-app-create.mjs — the OAuth install asks for
 * exactly what the app's manifest declares.
 */
export const SLACK_BOT_SCOPES = [
  'im:write',
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'chat:write',
  'users:read',
  'users:read.email',
  'im:read',
  'im:history',
  'assistant:write',
].join(',');

/** CSRF state cookie for the OAuth round-trip. */
export const SLACK_STATE_COOKIE = 'slack_oauth_state';
