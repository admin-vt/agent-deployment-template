import botScopes from '../../slack-bot-scopes.json';

/**
 * Bot scopes requested at install — single-sourced from
 * /slack-bot-scopes.json, shared with the app manifest in
 * scripts/slack-app-create.mjs so the OAuth install asks for exactly what
 * the app declares.
 */
export const SLACK_BOT_SCOPES = botScopes.join(',');

/** CSRF state cookie for the OAuth round-trip. */
export const SLACK_STATE_COOKIE = 'slack_oauth_state';
