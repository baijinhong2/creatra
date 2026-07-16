/**
 * POST /api/account/x-handle
 * GET:读
 * POST:更新 vp_users.x_handle
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { getDb, TABLE } from'@/lib/db';

export async function GET() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const db = getDb();
 if (!db) return NextResponse.json({ error:'db_unavailable'}, { status: 503 });

 const r = await db.query<{ x_handle: string | null }>(
 `SELECT x_handle FROM ${TABLE.users} WHERE id = $1`,
 [user.id],
 );
 return NextResponse.json({ x_handle: r.rows[0]?.x_handle ?? null });
}

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const raw = (body.x_handle ?? body.handle ??'').toString().trim();
 const cleaned = raw.replace(/^@/,'').replace(/[^a-zA-Z0-9_]/g,'');

 if (!cleaned) {
 return NextResponse.json({ error:'empty_handle'}, { status: 400 });
 }
 if (cleaned.length > 50) {
 return NextResponse.json({ error:'handle_too_long'}, { status: 400 });
 }

 const db = getDb();
 if (!db) return NextResponse.json({ error:'db_unavailable'}, { status: 503 });

 await db.query(
 `UPDATE ${TABLE.users} SET x_handle = $1, updated_at = now() WHERE id = $2`,
 [cleaned, user.id],
 );

 return NextResponse.json({ success: true, x_handle: cleaned });
}

export async function DELETE() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const db = getDb();
 if (!db) return NextResponse.json({ error:'db_unavailable'}, { status: 503 });

 await db.query(
 `UPDATE ${TABLE.users} SET x_handle = NULL, updated_at = now() WHERE id = $1`,
 [user.id],
 );

 return NextResponse.json({ success: true });
}
