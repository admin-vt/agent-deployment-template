import { withAuth } from '@workos-inc/authkit-nextjs';
import { WorkOS } from '@workos-inc/node';
import { NextRequest, NextResponse } from 'next/server';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

/**
 * Edit the Slack allowlist — the emails allowed to talk to the agent.
 * Stored in the agent account's WorkOS metadata (docs/identity-model.md).
 * Whoever holds the agent credential is the admin; no roles needed.
 */
export async function POST(req: NextRequest) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const form = await req.formData();
  const action = String(form.get('action') ?? 'add');
  const email = String(form.get('email') ?? '').trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  const current = await workos.userManagement.getUser(user.id);
  let list: string[] = [];
  try {
    const parsed = JSON.parse((current.metadata as Record<string, string>)?.slackAllowlist ?? '[]');
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = [];
  }

  const next =
    action === 'remove'
      ? list.filter((e) => e.toLowerCase() !== email)
      : [...new Set([...list.map((e) => e.toLowerCase()), email])];

  await workos.userManagement.updateUser({
    userId: user.id,
    metadata: { slackAllowlist: JSON.stringify(next) },
  });

  return NextResponse.redirect(new URL('/', req.url), 303);
}
