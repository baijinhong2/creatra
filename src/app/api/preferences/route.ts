import { NextRequest, NextResponse } from 'next/server';
import { getDb, TABLE } from '@/lib/db';
import { currentSessionIdServer, userFromSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET_KEY_RE = /\.(token|key|secret|auth_token|ct0|password)$/i;

/**
 * GET /api/preferences — current user's stored preferences.
 */
export async function GET() {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  try {
    const r = await db.query<{ key: string; value: unknown; updated_at: unknown }>(
      `SELECT key, value, updated_at FROM ${TABLE.preferences}
       WHERE user_id = $1 ORDER BY key`,
      [user.id],
    );
    const out = r.rows.map((row) => {
      const isSecret = SECRET_KEY_RE.test(row.key);
      return {
        key: row.key,
        value: isSecret ? (row.value ? '[REDACTED: set]' : '[not set]') : row.value,
        is_secret: isSecret,
        has_value: row.value != null,
        updated_at: String(row.updated_at),
      };
    });
    return NextResponse.json({ preferences: out });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/preferences — upsert one preference row for the current user.
 */
export async function PUT(request: NextRequest) {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  let body: { key?: string; value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const key = (body.key ?? '').trim();
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  if (key.length > 200 || !/^[a-z0-9._-]+$/i.test(key)) {
    return NextResponse.json(
      { error: 'key must be lowercase/numbers/dot/dash/underscore, ≤200 chars' },
      { status: 400 },
    );
  }

  const isSecret = SECRET_KEY_RE.test(key);
  let valueToStore: unknown = body.value;
  if (isSecret && typeof valueToStore !== 'string') {
    return NextResponse.json(
      { error: 'Secret-shaped keys accept only string values' },
      { status: 400 },
    );
  }
  if (typeof valueToStore === 'string') valueToStore = valueToStore.trim();

  try {
    await db.query(
      `INSERT INTO ${TABLE.preferences} (user_id, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [user.id, key, JSON.stringify(valueToStore)],
    );
    return NextResponse.json({ ok: true, key, is_secret: isSecret });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}

/** DELETE /api/preferences?key=foo — forget one preference. */
export async function DELETE(request: NextRequest) {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const url = new URL(request.url);
  const key = (url.searchParams.get('key') ?? '').trim();
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  try {
    await db.query(
      `DELETE FROM ${TABLE.preferences} WHERE user_id = $1 AND key = $2`,
      [user.id, key],
    );
    return NextResponse.json({ ok: true, key });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
