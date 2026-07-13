import { NextResponse } from 'next/server';
import { getDb, TABLE } from '@/lib/db';
import { currentSessionIdServer, userFromSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations — current user's conversations, newest first.
 */
export async function GET() {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  try {
    const r = await db.query<{
      id: string;
      title: string;
      mode: 'auto' | 'expert' | 'assistant';
      created_at: Date;
      updated_at: Date;
      message_count: string;
    }>(
      `SELECT c.id, c.title, c.mode, c.created_at, c.updated_at,
              COALESCE((SELECT count(*) FROM ${TABLE.messages} m WHERE m.conversation_id = c.id), 0) AS message_count
       FROM ${TABLE.conversations} c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      [user.id],
    );
    return NextResponse.json({
      conversations: r.rows.map((row) => ({
        id: row.id,
        title: row.title,
        mode: row.mode,
        created_at:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updated_at:
          row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        message_count: Number(row.message_count),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
