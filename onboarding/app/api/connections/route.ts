import { withAuth } from '@workos-inc/authkit-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { AuthScheme } from '@composio/core';
import { composio, TOOLKITS } from '../../../lib/composio';

/**
 * Connect a toolkit for the signed-in user.
 * - OAuth toolkits: redirect the user to a Composio Connect Link.
 * - API-key toolkits with an operator-provided credential (e.g. Firecrawl):
 *   create the connected account server-side, no user input needed.
 */
export async function POST(req: NextRequest) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const toolkit = req.nextUrl.searchParams.get('toolkit') ?? '';
  if (!TOOLKITS.includes(toolkit)) {
    return NextResponse.json({ error: `unknown toolkit: ${toolkit}` }, { status: 400 });
  }

  const configs = await composio.authConfigs.list({ toolkit });
  const authConfig = configs.items?.[0];
  if (!authConfig) {
    return NextResponse.json(
      { error: `no auth config for ${toolkit}; create one in Composio first` },
      { status: 500 },
    );
  }

  // Drop stale non-ACTIVE connections (verified: they shadow ACTIVE ones)
  const existing = await composio.connectedAccounts.list({ userIds: [user.id] });
  for (const conn of existing.items ?? []) {
    if (conn.toolkit?.slug === toolkit && conn.status !== 'ACTIVE') {
      await composio.connectedAccounts.delete(conn.id);
    }
  }

  if (toolkit === 'firecrawl' && process.env.FIRECRAWL_API_KEY) {
    await composio.connectedAccounts.initiate(user.id, authConfig.id, {
      config: AuthScheme.APIKey({
        api_key: process.env.FIRECRAWL_API_KEY,
        full: 'https://api.firecrawl.dev/v1',
      }),
    });
    return NextResponse.redirect(new URL('/', req.url), 303);
  }

  const link = await composio.connectedAccounts.link(user.id, authConfig.id, {
    callbackUrl: new URL('/', req.url).toString(),
  });
  return NextResponse.redirect(link.redirectUrl!, 303);
}
