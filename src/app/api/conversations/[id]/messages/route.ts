import { NextRequest, NextResponse } from'next/server';
import { getDb, TABLE } from'@/lib/db';
import { currentSessionIdServer, userFromSession } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

type MessageRow = {
 id: string;
 conversation_id: string;
 role:'user'|'assistant'|'system'|'tool';
 content: string | null;
 metadata: Record<string, unknown> | null;
 created_at: string;
};

/**
 * GET /api/conversations/:id/messages
 *
 * Returns the message log for one of the current user's conversations,
 * oldest → newest.
 */
export async function GET(
 _request: NextRequest,
 { params }: { params: Promise<{ id: string }> },
) {
 const sid = await currentSessionIdServer();
 const user = await userFromSession(sid);
 if (!user) return NextResponse.json({ error:'Unauthorized'}, { status: 401 });

 const { id } = await params;
 if (!id) return NextResponse.json({ error:'id required'}, { status: 400 });

 const db = getDb();
 if (!db) return NextResponse.json({ error:'DB not configured'}, { status: 503 });

 try {
 const convRes = await db.query<{
 id: string;
 title: string;
 mode:'auto'|'expert'|'assistant';
 created_at: Date;
 updated_at: Date;
 }>(
 `SELECT id, title, mode, created_at, updated_at FROM ${TABLE.conversations}
 WHERE id = $1 AND user_id = $2`,
 [id, user.id],
 );
 const conv = convRes.rows[0];
 if (!conv) {
 return NextResponse.json(
 { error:'Conversation not found'},
 { status: 404 },
 );
 }

 const msgRes = await db.query<MessageRow>(
 `SELECT id, conversation_id, role, content, metadata, created_at
 FROM ${TABLE.messages}
 WHERE conversation_id = $1
 ORDER BY created_at ASC`,
 [id],
 );

 return NextResponse.json({
 conversation: {
 id: conv.id,
 title: conv.title,
 mode: conv.mode,
 created_at: conv.created_at.toISOString(),
 updated_at: conv.updated_at.toISOString(),
 },
 messages: msgRes.rows.map((m) => ({
 ...m,
 created_at: String(m.created_at),
 })),
 });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message :'unknown'},
 { status: 500 },
 );
 }
}
