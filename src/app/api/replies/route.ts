/**
 * GET:list replies
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { listReplies, countRepliesByStatus, type ReplyStatus } from'@/lib/replies';

export async function GET(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const { searchParams } = new URL(req.url);
 const status = (searchParams.get('status') as ReplyStatus | null) ?? undefined;
 const limit = parseInt(searchParams.get('limit') ??'50', 10);

 const [replies, counts] = await Promise.all([
 listReplies(user.id, { status, limit }),
 countRepliesByStatus(user.id),
 ]);

 return NextResponse.json({ replies, counts, total: replies.length });
}
