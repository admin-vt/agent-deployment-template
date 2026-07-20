import { withAuth } from '@workos-inc/authkit-nextjs';
import { WorkOS } from '@workos-inc/node';
import { NextRequest, NextResponse } from 'next/server';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

/**
 * Store the user's OpenRouter key in WorkOS user metadata (the deployment
 * runs storage-free — WorkOS is the system of record for user state).
 * The key is validated against OpenRouter before saving.
 */
export async function POST(req: NextRequest) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const form = await req.formData();
  const key = String(form.get('key') ?? '').trim();

  const check = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!check.ok) {
    return NextResponse.json({ error: 'OpenRouter rejected this key' }, { status: 400 });
  }

  await workos.userManagement.updateUser({
    userId: user.id,
    metadata: { openrouterKey: key, openrouterKeySet: 'true' },
  });

  return NextResponse.redirect(new URL('/', req.url), 303);
}
