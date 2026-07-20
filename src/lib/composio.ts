import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { templateConfig } from '../../template.config';

/**
 * Composio is the deployment's entire tool layer: per-user connected accounts,
 * catalog tool execution, and the Remote Sandbox. Sessions are user-scoped —
 * every tool call executes as that user's connected accounts.
 */
export const composio = new Composio({ provider: new MastraProvider() });

type ComposioSession = Awaited<ReturnType<typeof composio.create>>;

const sessionCache = new Map<string, Promise<ComposioSession>>();

/**
 * Session per user, bound to the deployment's toolkits and the user's ACTIVE
 * connected accounts, with the sandbox enabled. Verified behavior (V3): a
 * session created without explicit toolkit binding does not see the user's
 * connections, and stale non-ACTIVE accounts shadow ACTIVE ones.
 */
export function getSession(userId: string): Promise<ComposioSession> {
  let cached = sessionCache.get(userId);
  if (!cached) {
    cached = createSession(userId);
    sessionCache.set(userId, cached);
  }
  return cached;
}

async function createSession(userId: string): Promise<ComposioSession> {
  const toolkits: string[] = [...templateConfig.composio.toolkits];
  const conns = await composio.connectedAccounts.list({ userIds: [userId] });

  const connectedAccounts: Record<string, string> = {};
  for (const conn of conns.items ?? []) {
    const slug = conn.toolkit?.slug;
    if (slug && conn.status === 'ACTIVE' && toolkits.includes(slug) && !connectedAccounts[slug]) {
      connectedAccounts[slug] = conn.id;
    }
  }

  return composio.create(userId, {
    toolkits,
    connectedAccounts,
    manageConnections: true,
    sandbox: { enable: true },
  });
}

/** Tools for a user's session, formatted for Mastra by @composio/mastra. */
export async function getUserTools(userId: string) {
  const session = await getSession(userId);
  return session.tools();
}

export function defaultUserId(): string {
  return templateConfig.composio.defaultUserId;
}
