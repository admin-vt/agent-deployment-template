/**
 * The deployment's single identity: the agent account (docs/identity-model.md).
 * One WorkOS user per agent; its metadata carries the deployment's runtime
 * settings (Slack allowlist, the client's OpenRouter key). Humans are allowed
 * conversants on the allowlist — they have no accounts.
 */

const WORKOS_API = 'https://api.workos.com';
const CACHE_TTL_MS = 30_000;

export function agentUserId(): string {
  const id = process.env.WORKOS_AGENT_USER_ID;
  if (!id) throw new Error('WORKOS_AGENT_USER_ID is not set');
  return id;
}

type AgentAccount = { email: string; metadata: Record<string, string> };

let accountCache: { value: AgentAccount; at: number } | null = null;

export async function getAgentAccount(): Promise<AgentAccount> {
  if (accountCache && Date.now() - accountCache.at < CACHE_TTL_MS) return accountCache.value;
  const res = await fetch(`${WORKOS_API}/user_management/users/${agentUserId()}`, {
    headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
  });
  if (!res.ok) throw new Error(`WorkOS user fetch failed: ${res.status}`);
  const user = (await res.json()) as { email: string; metadata?: Record<string, string> };
  const value = { email: user.email, metadata: user.metadata ?? {} };
  accountCache = { value, at: Date.now() };
  return value;
}

/** Emails allowed to talk to the agent in Slack. Empty list = closed. */
export async function getSlackAllowlist(): Promise<string[]> {
  const { metadata } = await getAgentAccount();
  try {
    const list = JSON.parse(metadata.slackAllowlist ?? '[]');
    return Array.isArray(list) ? list.map((e: string) => e.toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

/** The client's OpenRouter key (BYOK), set on the onboarding page; dev key as fallback. */
export async function getModelApiKey(): Promise<string> {
  const { metadata } = await getAgentAccount();
  return metadata.openrouterKey || process.env.OPENROUTER_API_KEY || '';
}

const emailCache = new Map<string, string | null>();

/**
 * Slack user id -> email, via users.info. Requires the users:read.email bot
 * scope; returns null when unavailable (missing scope, external user, etc.).
 */
export async function resolveSlackEmail(slackUserId: string): Promise<string | null> {
  if (emailCache.has(slackUserId)) return emailCache.get(slackUserId) ?? null;
  const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  const data = (await res.json()) as { ok: boolean; user?: { profile?: { email?: string } } };
  const email = data.ok ? (data.user?.profile?.email ?? null) : null;
  emailCache.set(slackUserId, email);
  return email ? email.toLowerCase() : null;
}
