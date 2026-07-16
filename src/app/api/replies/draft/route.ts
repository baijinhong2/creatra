/**
 * POST /api/replies/draft
 * 给某条 reply 起草回复
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { listReplies, updateReplyStatus } from'@/lib/replies';
import { draftReplies } from'@/lib/replyDrafter';

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = await req.json().catch(() => ({}));
 const replyInboxId = body.reply_inbox_id as string | undefined;
 if (!replyInboxId) {
 return NextResponse.json({ error:'reply_inbox_id required'}, { status: 400 });
 }

 const all = await listReplies(user.id, { limit: 200 });
 const reply = all.find((r) => r.id === replyInboxId);
 if (!reply) {
 return NextResponse.json({ error:'reply not found'}, { status: 404 });
 }

 const count = Number(body.count) || 3;

 const result = await draftReplies(
 user.id,
 reply.parent_tweet_text,
 reply.reply_text,
 reply.reply_author_handle ??'unknown',
 count,
 body.tone_override,
 );

 // Auto-save first draft as drafted_response
 if (result.drafts.length > 0) {
 await updateReplyStatus(user.id, replyInboxId, {
 status:'drafted',
 drafted_response: result.drafts[0].text,
 draft_meta: { drafts: result.drafts, generated_at: new Date().toISOString() },
 });
 }

 return NextResponse.json({ success: true, ...result });
}
