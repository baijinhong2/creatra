import { NextRequest, NextResponse } from 'next/server';
import { getDb, TABLE } from '@/lib/db';
import { currentSessionIdServer, userFromSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PatchBody = {
  mode?: 'auto' | 'expert' | 'assistant';
  title?: string;
};

const VALID_MODES = new Set(['auto', 'expert', 'assistant']);

/**
 * PATCH /api/conversations/:id — update mutable fields.
 *
 * Currently supports:
 *  - `mode`: switch the conversation's interaction mode (auto/expert/assistant)
 *  - `title`: rename a conversation
 *
 * Auth: only the owner can patch. We check user_id explicitly rather than
 * relying on RLS so the failure mode is a clear 403/404.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.mode && !body.title) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  if (body.mode && !VALID_MODES.has(body.mode)) {
    return NextResponse.json(
      { error: `mode must be one of: ${[...VALID_MODES].join(', ')}` },
      { status: 400 },
    );
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  try {
    // Confirm ownership first.
    const owner = await db.query<{ id: string }>(
      `SELECT id FROM ${TABLE.conversations} WHERE id = $1 AND user_id = $2`,
      [id, user.id],
    );
    if (!owner.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Build a minimal dynamic SET clause.
    const sets: string[] = [];
    const args: unknown[] = [];
    if (body.mode) {
      args.push(body.mode);
      sets.push(`mode = \$${args.length}`);
    }
    if (body.title) {
      args.push(body.title);
      sets.push(`title = \$${args.length}`);
    }
    sets.push('updated_at = now()');
    args.push(id);

    const r = await db.query<{
      id: string;
      title: string;
      mode: 'auto' | 'expert' | 'assistant';
      updated_at: Date;
    }>(
      `UPDATE ${TABLE.conversations} SET ${sets.join(', ')}
       WHERE id = \$${args.length}
       RETURNING id, title, mode, updated_at`,
      args,
    );

    return NextResponse.json({ conversation: r.rows[0] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
