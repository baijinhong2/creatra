/**
 * PATCH /api/replies/[id]
 * 状态变更 / 保存草稿
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { updateReplyStatus } from'@/lib/replies';

export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> },
) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const { id } = await params;
 const body = await req.json().catch(() => ({}));

 if (!body.action) {
 return NextResponse.json({ error:'action required'}, { status: 400 });
 }

 if (body.action ==='mark_drafted'&& body.drafted_response) {
 const reply = await updateReplyStatus(user.id, id, {
 status:'drafted',
 drafted_response: body.drafted_response,
 draft_meta: body.draft_meta,
 });
 return NextResponse.json({ success: true, reply });
 }

 if (body.action ==='update_draft') {
 const reply = await updateReplyStatus(user.id, id, {
 drafted_response: body.drafted_response,
 draft_meta: body.draft_meta,
 });
 return NextResponse.json({ success: true, reply });
 }

 if (body.action ==='mark_handled') {
 const reply = await updateReplyStatus(user.id, id, {
 status:'handled',
 handled_at: new Date().toISOString(),
 });
 return NextResponse.json({ success: true, reply });
 }

 if (body.action ==='mark_skipped') {
 const reply = await updateReplyStatus(user.id, id, {
 status:'skipped',
 handled_at: new Date().toISOString(),
 });
 return NextResponse.json({ success: true, reply });
 }

 if (body.action ==='reopen') {
 const reply = await updateReplyStatus(user.id, id, {
 status:'new',
 handled_at: undefined,
 });
 return NextResponse.json({ success: true, reply });
 }

 return NextResponse.json({ error:'unknown action'}, { status: 400 });
}
