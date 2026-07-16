/**
 * /api/insights/[id] — delete a single insight.
 * Per-user scoped: 404 if the row isn't owned by the current user.
 */

import { NextRequest, NextResponse } from'next/server';
import { getDb, TABLE } from'@/lib/db';
import { currentSessionIdServer, userFromSession } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

export async function DELETE(
 _request: NextRequest,
 { params }: { params: Promise<{ id: string }> },
) {
 const sid = await currentSessionIdServer();
 const user = await userFromSession(sid);
 if (!user) return NextResponse.json({ error:'Unauthorized'}, { status: 401 });

 const db = getDb();
 if (!db) return NextResponse.json({ error:'DB not configured'}, { status: 503 });

 const { id } = await params;
 // Defensive: only accept uuid-shaped ids to avoid query errors.
 if (!/^[0-9a-f-]{36}$/i.test(id)) {
 return NextResponse.json({ error:'invalid id'}, { status: 400 });
 }

 try {
 const r = await db.query(
 `DELETE FROM ${TABLE.insights} WHERE id = $1::uuid AND user_id = $2`,
 [id, user.id],
 );
 if (r.rowCount === 0) return NextResponse.json({ error:'not found'}, { status: 404 });
 return NextResponse.json({ ok: true, id });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message :'unknown'},
 { status: 500 },
 );
 }
}
