/**
 * GET /uploads/[...path] — serve files from public/uploads/.
 *
 * This is needed because Next.js's static-file serving only includes files
 * that existed at build time. Files uploaded at runtime (via /api/upload)
 * need this dynamic route to be served.
 *
 * For per-user privacy, /uploads/{userId}/{filename} is enforced — users
 * can only fetch their own files. (Cross-user direct URL guessing is
 * mitigated by uuid filenames; this enforces it explicitly.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { currentSessionIdServer, userFromSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

// Map mime to Content-Type header (small set, since /api/upload restricts types)
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // Auth check (always required, even for own files — no public bucket)
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { path: parts } = await params;
  if (!parts || parts.length < 2) {
    return new NextResponse('Bad path', { status: 400 });
  }

  // First segment must be the current user's id
  if (parts[0] !== user.id) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Resolve and ensure we stay inside UPLOADS_ROOT
  const target = path.join(UPLOADS_ROOT, ...parts);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(UPLOADS_ROOT))) {
    return new NextResponse('Bad path', { status: 400 });
  }

  try {
    const s = await stat(resolved);
    if (!s.isFile()) {
      return new NextResponse('Not found', { status: 404 });
    }
    const buf = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(s.size),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
