import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { templateConfig } from '../../template.config';
import { agentUserId } from './identity';

/**
 * Composio is the deployment's entire tool layer. Everything is scoped to the
 * single agent account (docs/identity-model.md): its connected accounts are
 * the tools this agent — and only this agent — has been authorized to use.
 * Each deployment runs in its own Composio project, so authorization can
 * never bleed between agents.
 */
export const composio = new Composio({ provider: new MastraProvider() });

type ComposioSession = Awaited<ReturnType<typeof composio.create>>;

let sessionPromise: Promise<ComposioSession> | null = null;

/**
 * The agent account's session, bound to the deployment's toolkits and the
 * account's ACTIVE connected accounts, sandbox enabled. Verified (V3): a
 * session without explicit toolkit binding does not see connections, and
 * stale non-ACTIVE accounts shadow ACTIVE ones.
 */
export function getAgentSession(): Promise<ComposioSession> {
  if (!sessionPromise) sessionPromise = createSession();
  return sessionPromise;
}

async function createSession(): Promise<ComposioSession> {
  const userId = agentUserId();
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

/** The agent's tools, formatted for Mastra by @composio/mastra. */
export async function getAgentTools() {
  const session = await getAgentSession();
  return session.tools();
}
