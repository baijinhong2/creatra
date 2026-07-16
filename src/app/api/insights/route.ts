/**
 * /api/insights — list + create user insights (accumulated content).
 *
 * Per-user scoped: rows are filtered by `current user` (resolved from
 * session cookie via `userFromSession`). RLS still allows service_role
 * reads/writes for migrations; user_id enforcement happens here in code.
 */

import { NextRequest, NextResponse } from'next/server';
import { getDb, TABLE } from'@/lib/db';
import { currentSessionIdServer, userFromSession } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

const ALLOWED_KINDS = new Set(['reflection','project_breakdown','method','discovery','sharing','fragment',
]);

type Insight = {
 id: string;
 user_id: string;
 kind: string;
 title: string;
 body: string;
 tags: string[];
 source_conversation_id: string | null;
 metadata: unknown;
 created_at: string;
};

/** GET /api/insights?kind=&q=&limit= */
export async function GET(request: NextRequest) {
 const sid = await currentSessionIdServer();
 const user = await userFromSession(sid);
 if (!user) return NextResponse.json({ error:'Unauthorized'}, { status: 401 });

 const db = getDb();
 if (!db) return NextResponse.json({ error:'DB not configured'}, { status: 503 });

 const url = new URL(request.url);
 const kind = url.searchParams.get('kind')?.trim() || null;
 const q = url.searchParams.get('q')?.trim() || null;
 const limitParam = Number(url.searchParams.get('limit') ?? 200);
 const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 200, 1), 500);

 try {
 const params: unknown[] = [user.id];
 let where ='user_id = $1';
 if (kind && ALLOWED_KINDS.has(kind)) {
 params.push(kind);
 where += ` AND kind = $${params.length}`;
 }
 if (q) {
 params.push(`%${q}%`);
 const i = params.length;
 where += ` AND (title ILIKE $${i} OR body ILIKE $${i})`;
 }
 params.push(limit);
 const r = await db.query<Insight>(
 `SELECT id, user_id, kind, title, body, tags, source_conversation_id, metadata, created_at
 FROM ${TABLE.insights}
 WHERE ${where}
 ORDER BY created_at DESC
 LIMIT $${params.length}`,
 params,
 );
 return NextResponse.json({ insights: r.rows });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message :'unknown'},
 { status: 500 },
 );
 }
}

/** POST /api/insights — create a new insight for the current user. */
export async function POST(request: NextRequest) {
 const sid = await currentSessionIdServer();
 const user = await userFromSession(sid);
 if (!user) return NextResponse.json({ error:'Unauthorized'}, { status: 401 });

 const db = getDb();
 if (!db) return NextResponse.json({ error:'DB not configured'}, { status: 503 });

 let body: {
 kind?: string;
 title?: string;
 body?: string;
 tags?: string[];
 source_conversation_id?: string | null;
 metadata?: unknown;
 };
 try {
 body = (await request.json()) as typeof body;
 } catch {
 return NextResponse.json({ error:'Invalid JSON'}, { status: 400 });
 }

 const kind = (body.kind ??'').trim();
 const title = (body.title ??'').trim();
 const bodyText = (body.body ??'').trim();
 if (!ALLOWED_KINDS.has(kind)) {
 return NextResponse.json(
 { error: `kind must be one of: ${[...ALLOWED_KINDS].join(',')}` },
 { status: 400 },
 );
 }
 if (!title) return NextResponse.json({ error:'title required'}, { status: 400 });
 if (!bodyText) return NextResponse.json({ error:'body required'}, { status: 400 });
 if (title.length > 200) return NextResponse.json({ error:'title too long'}, { status: 400 });
 if (bodyText.length > 20_000) {
 return NextResponse.json({ error:'body too long (max 20k chars)'}, { status: 400 });
 }

 const tags = Array.isArray(body.tags)
 ? body.tags.filter((t): t is string => typeof t ==='string').slice(0, 20).map((t) => t.slice(0, 60))
 : [];

 const sourceConversationId = typeof body.source_conversation_id ==='string'&& body.source_conversation_id.length > 0
 ? body.source_conversation_id
 : null;

 try {
 const r = await db.query<{ id: string }>(
 `INSERT INTO ${TABLE.insights} (user_id, kind, title, body, tags, source_conversation_id, metadata)
 VALUES ($1, $2, $3, $4, $5::text[], $6::uuid, $7::jsonb)
 RETURNING id`,
 [
 user.id,
 kind,
 title,
 bodyText,
 tags,
 sourceConversationId,
 JSON.stringify(body.metadata ?? {}),
 ],
 );
 return NextResponse.json({ ok: true, id: r.rows[0]?.id });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message :'unknown'},
 { status: 500 },
 );
 }
}
