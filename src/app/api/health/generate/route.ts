/**
 * POST /api/health/generate
 * GET: get latest report
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { generateHealthReport, getLatestHealthReport } from'@/lib/accountHealth';
import { getDb, TABLE } from'@/lib/db';

export async function POST() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 // Get x_handle from preferences
 let xHandle: string | null = null;
 const db = getDb();
 if (db) {
 const r = await db.query<{ x_handle: string | null }>(
 `SELECT x_handle FROM ${TABLE.users} WHERE id = $1`,
 [user.id],
 );
 xHandle = r.rows[0]?.x_handle;
 }

 if (!xHandle) {
 return NextResponse.json(
 { error:'x_handle_required', message:'先去 UserMenu 设置 x_handle'},
 { status: 400 },
 );
 }

 try {
 const report = await generateHealthReport(user.id, xHandle);
 if (!report) {
 return NextResponse.json({ error:'generation_failed'}, { status: 500 });
 }
 return NextResponse.json({ success: true, report });
 } catch (e) {
 return NextResponse.json(
 { error:'failed', message: e instanceof Error ? e.message : String(e) },
 { status: 500 },
 );
 }
}

export async function GET() {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });
 const report = await getLatestHealthReport(user.id);
 return NextResponse.json({ report });
}
