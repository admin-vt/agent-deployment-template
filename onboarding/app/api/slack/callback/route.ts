import { withAuth } from '@workos-inc/authkit-nextjs';
import { WorkOS } from '@workos-inc/node';
import { NextRequest, NextResponse } from 'next/server';
import { SLACK_STATE_COOKIE } from '../../../../lib/slack';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

/**
 * "Add to Slack" OAuth callback: exchange the code for the workspace's bot
 * token (oauth.v2.access) and store it on the agent account's metadata —
 * where the deployed agent resolves it per call (src/lib/identity.ts). The
 * client never sees or handles a credential.
 */
export async function GET(req: NextRequest) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const params = req.nextUrl.searchParams;

  const done = (query: string) => {
    const res = NextResponse.redirect(new URL(`/${query}`, req.url), 303);
    res.cookies.delete(SLACK_STATE_COOKIE);
    return res;
  };

  // User hit "Cancel" on Slack's consent screen, or Slack reported an error.
  const slackError = params.get('error');
  if (slackError) return done(`?slack_error=${encodeURIComponent(slackError)}`);

  const code = params.get('code');
  const state = params.get('state');
  const cookieState = req.cookies.get(SLACK_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return done('?slack_error=state_mismatch');
  }

  const exchange = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID ?? '',
      client_secret: process.env.SLACK_CLIENT_SECRET ?? '',
      redirect_uri: new URL('/api/slack/callback', req.url).toString(),
    }),
  });
  const data = (await exchange.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    token_type?: string;
    bot_user_id?: string;
    team?: { id?: string; name?: string };
  };
  if (!data.ok || !data.access_token || data.token_type !== 'bot') {
    return done(`?slack_error=${encodeURIComponent(data.error ?? 'no_bot_token')}`);
  }

  await workos.userManagement.updateUser({
    userId: user.id,
    metadata: {
      slackBotToken: data.access_token,
      slackTeamId: data.team?.id ?? '',
      slackTeamName: data.team?.name ?? '',
      slackBotUserId: data.bot_user_id ?? '',
    },
  });

  return done('?slack_installed=1');
}
