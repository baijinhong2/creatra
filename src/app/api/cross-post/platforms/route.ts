/**
 * GET /api/cross-post/platforms
 */

import { NextResponse } from'next/server';
import { getPlatformMeta, type Platform } from'@/lib/crossPost';

const PLATFORMS: Platform[] = ['jike','xiaohongshu','linkedin'];

export async function GET() {
 return NextResponse.json({
 platforms: PLATFORMS.map(getPlatformMeta),
 });
}
