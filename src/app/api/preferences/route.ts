import { NextRequest, NextResponse } from 'next/server';
import { getDb, TABLE } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Keys whose values should never be sent back to clients (raw or full).
const SECRET_KEY_RE = /\.(token|key|secret|auth_token|ct0|password)$/i;

/**
 * GET /api/preferences
 *
 * Returns all stored preferences. Values for secret-shaped keys are
 * redacted as `[REDACTED: set]` so the UI can show "configured" status
 * without leaking the value.
 */
export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  try {
    const r = await db.query<{ key: string; value: unknown; updated_at: unknown }>(
      `SELECT key, value, updated_at FROM ${TABLE.preferences} ORDER BY key`,
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
 * PUT /api/preferences
 *
 * Body: { key: string, value: unknown }
 *
 * Upserts a single preference row. Used by the UI's Sources panel and
 * indirectly by the agent's `remember_preference` tool.
 */
export async function PUT(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  let body: { key?: string; value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const key = (body.key ?? '').trim();
  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }
  if (key.length > 200 || !/^[a-z0-9._-]+$/i.test(key)) {
    return NextResponse.json(
      { error: 'key must be lowercase/numbers/dot/dash/underscore, ≤200 chars' },
      { status: 400 },
    );
  }

  const isSecret = SECRET_KEY_RE.test(key);
  // For non-secret keys, accept any JSON. For secret keys, restrict to strings
  // so we never accidentally store a structured object as a "credential".
  let valueToStore: unknown = body.value;
  if (isSecret && typeof valueToStore !== 'string') {
    return NextResponse.json(
      { error: 'Secret-shaped keys accept only string values' },
      { status: 400 },
    );
  }
  if (typeof valueToStore === 'string') {
    valueToStore = valueToStore.trim();
  }

  try {
    await db.query(
      `INSERT INTO ${TABLE.preferences} (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(valueToStore)],
    );
    return NextResponse.json({
      ok: true,
      key,
      is_secret: isSecret,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}

/** DELETE /api/preferences?key=foo — removes a preference. */
export async function DELETE(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const key = (url.searchParams.get('key') ?? '').trim();
  if (!key) {
    return NextResponse.json({ error: 'key query param required' }, { status: 400 });
  }
  try {
    await db.query(`DELETE FROM ${TABLE.preferences} WHERE key = $1`, [key]);
    return NextResponse.json({ ok: true, key });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
