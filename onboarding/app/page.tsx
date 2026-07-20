import { withAuth, signOut } from '@workos-inc/authkit-nextjs';
import { WorkOS } from '@workos-inc/node';
import { composio, TOOLKITS } from '../lib/composio';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

/**
 * The agent console. One account per agent (docs/identity-model.md): the
 * signed-in user IS the agent account. Whoever holds the credential
 * authorizes tools, sets the model key, and manages the Slack allowlist.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const query = await searchParams;
  const slackError = typeof query.slack_error === 'string' ? query.slack_error : null;

  const conns = await composio.connectedAccounts.list({ userIds: [user.id] });
  const connected = new Set(
    (conns.items ?? [])
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => c.toolkit?.slug)
      .filter(Boolean),
  );

  const fullUser = await workos.userManagement.getUser(user.id);
  const metadata = (fullUser.metadata ?? {}) as Record<string, string>;
  const hasModelKey = Boolean(metadata.openrouterKey);
  const slackTeam = metadata.slackTeamName || null;
  const slackAppReady = Boolean(process.env.SLACK_CLIENT_ID);
  let allowlist: string[] = [];
  try {
    const parsed = JSON.parse(metadata.slackAllowlist ?? '[]');
    if (Array.isArray(parsed)) allowlist = parsed;
  } catch {}

  return (
    <main>
      <h1>Agent console</h1>
      <p>
        Agent account: <strong>{user.email}</strong>{' '}
        <form action={async () => { 'use server'; await signOut(); }} style={{ display: 'inline' }}>
          <button type="submit">Sign out</button>
        </form>
      </p>

      <h2>1. Authorized tools</h2>
      <p>Tools this agent — and only this agent — may use. Connect service/shared accounts, not personal ones.</p>
      <ul>
        {TOOLKITS.map((toolkit) => (
          <li key={toolkit} style={{ marginBottom: '0.5rem' }}>
            <code>{toolkit}</code>:{' '}
            {connected.has(toolkit) ? (
              <span>✅ authorized</span>
            ) : (
              <form action={`/api/connections?toolkit=${toolkit}`} method="post" style={{ display: 'inline' }}>
                <button type="submit">Authorize</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <h2>2. Model key (bring your own key)</h2>
      <p>
        The agent bills model usage to your OpenRouter account. Get a key at{' '}
        <a href="https://openrouter.ai/keys">openrouter.ai/keys</a>.
      </p>
      <p>Status: {hasModelKey ? '✅ key on file' : '❌ no key yet'}</p>
      <form action="/api/openrouter-key" method="post">
        <input type="password" name="key" placeholder="sk-or-v1-..." style={{ width: '20rem' }} required />
        <button type="submit">Save</button>
      </form>

      <h2>3. Add the agent to Slack</h2>
      {!slackAppReady ? (
        <p><em>Slack isn&apos;t set up for this deployment yet — your agency will enable it.</em></p>
      ) : (
        <>
          <p>
            Status:{' '}
            {slackTeam ? <span>✅ installed in <strong>{slackTeam}</strong></span> : <span>❌ not installed yet</span>}
          </p>
          {slackError && (
            <p style={{ color: 'crimson' }}>
              Slack install didn&apos;t complete (<code>{slackError}</code>) — try again, or contact your agency if it persists.
            </p>
          )}
          <form action="/api/slack/install" method="post">
            <button type="submit">{slackTeam ? 'Reinstall to Slack' : 'Add to Slack'}</button>
          </form>
        </>
      )}

      <h2>4. Who can talk to the agent (Slack)</h2>
      <p>Only these emails can use the agent in Slack. Everyone else gets a polite decline.</p>
      <ul>
        {allowlist.length === 0 && <li><em>Nobody yet — the agent is closed.</em></li>}
        {allowlist.map((email) => (
          <li key={email} style={{ marginBottom: '0.25rem' }}>
            {email}{' '}
            <form action="/api/allowlist" method="post" style={{ display: 'inline' }}>
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="email" value={email} />
              <button type="submit">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <form action="/api/allowlist" method="post">
        <input type="hidden" name="action" value="add" />
        <input type="email" name="email" placeholder="teammate@company.com" style={{ width: '16rem' }} required />
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
