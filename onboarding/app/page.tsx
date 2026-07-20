import { withAuth, signOut } from '@workos-inc/authkit-nextjs';
import { WorkOS } from '@workos-inc/node';
import { composio, TOOLKITS } from '../lib/composio';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

export default async function Home() {
  const { user } = await withAuth({ ensureSignedIn: true });

  const conns = await composio.connectedAccounts.list({ userIds: [user.id] });
  const connected = new Set(
    (conns.items ?? [])
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => c.toolkit?.slug)
      .filter(Boolean),
  );

  const fullUser = await workos.userManagement.getUser(user.id);
  const hasModelKey = Boolean((fullUser.metadata as Record<string, string> | undefined)?.openrouterKeySet);

  return (
    <main>
      <h1>Agent setup</h1>
      <p>
        Signed in as <strong>{user.email}</strong>{' '}
        <form action={async () => { 'use server'; await signOut(); }} style={{ display: 'inline' }}>
          <button type="submit">Sign out</button>
        </form>
      </p>

      <h2>1. Connect your tools</h2>
      <ul>
        {TOOLKITS.map((toolkit) => (
          <li key={toolkit} style={{ marginBottom: '0.5rem' }}>
            <code>{toolkit}</code>:{' '}
            {connected.has(toolkit) ? (
              <span>✅ connected</span>
            ) : (
              <form action={`/api/connections?toolkit=${toolkit}`} method="post" style={{ display: 'inline' }}>
                <button type="submit">Connect</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <h2>2. Model access (bring your own key)</h2>
      <p>
        Your agent bills model usage to <em>your</em> OpenRouter account. Paste an API key from{' '}
        <a href="https://openrouter.ai/keys">openrouter.ai/keys</a>.
      </p>
      <p>Status: {hasModelKey ? '✅ key on file' : '❌ no key yet'}</p>
      <form action="/api/openrouter-key" method="post">
        <input type="password" name="key" placeholder="sk-or-v1-..." style={{ width: '20rem' }} required />
        <button type="submit">Save</button>
      </form>
    </main>
  );
}
