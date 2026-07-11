import { NextRequest, NextResponse } from 'next/server';
import { getDb, TABLE } from '@/lib/db';
import { currentSessionIdServer, userFromSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET_KEY_RE = /\.(token|key|secret|auth_token|ct0|password)$/i;

const ALLOWED_SCOPES = new Set([
  'account',
  'voice',
  'projects',
  'insights',
  'tools',
  'episodic',
]);

function inferScope(key: string): string {
  if (SECRET_KEY_RE.test(key)) return 'tools';
  if (key.startsWith('project.')) return 'projects';
  if (['voice.tone', 'content.pillars', 'strategy.frequency', 'strategy.schedule', 'value.prop'].includes(key)) return 'voice';
  if ([
    'account.niche', 'account.positioning', 'target.audience', 'differentiation',
    'content.sources', 'brand.username', 'brand.bio', 'brand.avatar', 'brand.banner',
    'watchlist', 'track.competitors', 'x.handle',
  ].includes(key)) return 'account';
  if (key.startsWith('event.') || key.startsWith('history.')) return 'episodic';
  return 'account';
}

type PrefRow = {
  key: string;
  value: unknown;
  updated_at: unknown;
  last_used_at: Date | null;
  last_confirmed_at: Date;
  confidence: number;
  scope: string;
};

/**
 * GET /api/preferences
 *   ?scope=account,voice        — only those scopes
 *   ?used=true                  — bump last_used_at on returned rows (agent path)
 *   ?include=meta               — include confidence / last_used / scope fields (UI path)
 */
export async function GET(request: NextRequest) {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const url = new URL(request.url);
  const scopeParam = url.searchParams.get('scope')?.trim();
  const used = url.searchParams.get('used') === 'true';
  const includeMeta = url.searchParams.get('include') === 'meta';

  const params: unknown[] = [user.id];
  let where = 'user_id = $1';
  if (scopeParam) {
    const scopes = scopeParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ALLOWED_SCOPES.has(s));
    if (scopes.length === 0) {
      return NextResponse.json(
        { error: `scope must be one or more of: ${[...ALLOWED_SCOPES].join(', ')}` },
        { status: 400 },
      );
    }
    params.push(scopes);
    where += ` AND scope = ANY($${params.length}::text[])`;
  }

  try {
    const r = await db.query<PrefRow>(
      `SELECT key, value, updated_at, last_used_at, last_confirmed_at, confidence, scope
       FROM ${TABLE.preferences}
       WHERE ${where}
       ORDER BY scope, key`,
      params,
    );

    // If used=true, bump last_used_at = now() for the returned keys.
    // We do this BEFORE returning so the next read sees the new value.
    if (used && r.rows.length > 0) {
      const keys = r.rows.map((row) => row.key);
      await db.query(
        `UPDATE ${TABLE.preferences}
         SET last_used_at = now()
         WHERE user_id = $1 AND key = ANY($2::text[])`,
        [user.id, keys],
      );
      // Re-read so the response reflects the bump.
      const re = await db.query<PrefRow>(
        `SELECT key, value, updated_at, last_used_at, last_confirmed_at, confidence, scope
         FROM ${TABLE.preferences}
         WHERE user_id = $1 AND key = ANY($2::text[])
         ORDER BY scope, key`,
        [user.id, keys],
      );
      r.rows = re.rows;
    }

    const out = r.rows.map((row) => {
      const isSecret = SECRET_KEY_RE.test(row.key);
      return {
        key: row.key,
        value: isSecret ? (row.value ? '[REDACTED: set]' : '[not set]') : row.value,
        is_secret: isSecret,
        has_value: row.value != null,
        updated_at: String(row.updated_at),
        ...(includeMeta && {
          scope: row.scope,
          confidence: row.confidence,
          last_used_at: row.last_used_at ? String(row.last_used_at) : null,
          last_confirmed_at: String(row.last_confirmed_at),
        }),
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
 * PUT /api/preferences — upsert one preference row.
 * Returns the OLD value (if any) so the agent can detect conflicts.
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

  const scope = inferScope(key);

  try {
    // 1. fetch old value (if any) for conflict detection
    const old = await db.query<{ value: unknown; last_confirmed_at: Date }>(
      `SELECT value, last_confirmed_at FROM ${TABLE.preferences}
       WHERE user_id = $1 AND key = $2`,
      [user.id, key],
    );
    const oldValue = old.rows[0]?.value ?? null;
    const oldLastConfirmed = old.rows[0]?.last_confirmed_at ?? null;
    const isUpdate = oldValue !== null;
    const isConflict =
      isUpdate &&
      JSON.stringify(oldValue) !== JSON.stringify(valueToStore);

    // 2. upsert with lifecycle fields
    await db.query(
      `INSERT INTO ${TABLE.preferences}
         (user_id, key, value, updated_at, last_confirmed_at, confidence, scope)
       VALUES ($1, $2, $3::jsonb, now(), now(), 1.0, $4)
       ON CONFLICT (user_id, key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = now(),
             last_confirmed_at = now(),
             confidence = 1.0,
             scope = EXCLUDED.scope`,
      [user.id, key, JSON.stringify(valueToStore), scope],
    );

    return NextResponse.json({
      ok: true,
      key,
      is_secret: isSecret,
      scope,
      is_update: isUpdate,
      is_conflict: isConflict,
      old_value: isConflict && !isSecret ? oldValue : isSecret ? '[REDACTED]' : null,
      old_last_confirmed_at: oldLastConfirmed ? String(oldLastConfirmed) : null,
    });
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
