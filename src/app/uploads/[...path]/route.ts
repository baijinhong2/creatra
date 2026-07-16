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

import { NextRequest, NextResponse } from'next/server';
import { readFile, stat } from'fs/promises';
import path from'path';
import { currentSessionIdServer, userFromSession } from'@/lib/auth';

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

const UPLOADS_ROOT = path.join(process.cwd(),'public','uploads');

// Map mime to Content-Type header. Covers the whitelist in /api/upload.
// `text/html` and `image/svg+xml` are served as text/plain + attachment
// disposition to prevent rendering as a webpage (XSS-safe).
const MIME: Record<string, string> = {
 // images'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml',
 // text / code / config — served as text/plain so the browser shows source, not rendered'.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.markdown':'text/markdown; charset=utf-8','.rst':'text/plain; charset=utf-8','.html':'text/plain; charset=utf-8','.htm':'text/plain; charset=utf-8','.css':'text/css; charset=utf-8','.scss':'text/plain; charset=utf-8','.less':'text/plain; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.cjs':'application/javascript; charset=utf-8','.jsx':'text/plain; charset=utf-8','.ts':'text/plain; charset=utf-8','.tsx':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'text/plain; charset=utf-8', // treat as source, not rendered'.yml':'text/plain; charset=utf-8','.yaml':'text/plain; charset=utf-8','.toml':'text/plain; charset=utf-8','.ini':'text/plain; charset=utf-8','.conf':'text/plain; charset=utf-8','.cfg':'text/plain; charset=utf-8','.env':'text/plain; charset=utf-8','.sh':'text/plain; charset=utf-8','.bash':'text/plain; charset=utf-8','.zsh':'text/plain; charset=utf-8','.fish':'text/plain; charset=utf-8','.ps1':'text/plain; charset=utf-8','.sql':'text/plain; charset=utf-8','.graphql':'text/plain; charset=utf-8','.gql':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8','.tsv':'text/tab-separated-values; charset=utf-8','.log':'text/plain; charset=utf-8','.mdx':'text/plain; charset=utf-8','.vue':'text/plain; charset=utf-8','.svelte':'text/plain; charset=utf-8','.py':'text/plain; charset=utf-8','.pyi':'text/plain; charset=utf-8','.rb':'text/plain; charset=utf-8','.go':'text/plain; charset=utf-8','.rs':'text/plain; charset=utf-8','.java':'text/plain; charset=utf-8','.kt':'text/plain; charset=utf-8','.c':'text/plain; charset=utf-8','.h':'text/plain; charset=utf-8','.cpp':'text/plain; charset=utf-8','.hpp':'text/plain; charset=utf-8','.cs':'text/plain; charset=utf-8','.php':'text/plain; charset=utf-8','.swift':'text/plain; charset=utf-8','.m':'text/plain; charset=utf-8','.mm':'text/plain; charset=utf-8',
 // documents'.pdf':'application/pdf',
};

// File types that should be served as download (Content-Disposition:
// attachment) to prevent the browser from rendering them inline. This
// is critical for HTML/SVG to avoid XSS, and useful for code to keep
// the source format intact.
const FORCE_DOWNLOAD_EXTS = new Set(['.html','.htm','.svg','.xml','.pdf',
]);

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
 const contentType = MIME[ext] ??'application/octet-stream';
 const headers: Record<string, string> = {'Content-Type': contentType,'Content-Length': String(s.size),'Cache-Control':'private, max-age=300',
 };
 if (FORCE_DOWNLOAD_EXTS.has(ext)) {
 // Use the original filename when possible, fallback to ext-based.
 const downloadName = path.basename(resolved);
 headers['Content-Disposition'] =
 `attachment; filename="${downloadName}"`;
 }
 return new NextResponse(buf, { headers });
 } catch {
 return new NextResponse('Not found', { status: 404 });
 }
}
