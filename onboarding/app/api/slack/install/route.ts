import { withAuth } from '@workos-inc/authkit-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { SLACK_BOT_SCOPES, SLACK_STATE_COOKIE } from '../../../../lib/slack';

/**
 * Start the "Add to Slack" OAuth install: set a CSRF state cookie and send
 * the signed-in credential holder to Slack's authorize page for THIS
 * deployment's app. Slack redirects back to /api/slack/callback.
 */
export async function POST(req: NextRequest) {
  await withAuth({ ensureSignedIn: true });

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Slack app not provisioned for this deployment' }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const authorize = new URL('https://slack.com/oauth/v2/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('scope', SLACK_BOT_SCOPES);
  // Must exactly match a redirect URL registered on the app (the creation
  // script registers <onboarding-url>/api/slack/callback), so the console
  // must be used via its canonical domain.
  authorize.searchParams.set('redirect_uri', new URL('/api/slack/callback', req.url).toString());
  authorize.searchParams.set('state', state);

  const res = NextResponse.redirect(authorize, 303);
  res.cookies.set(SLACK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
