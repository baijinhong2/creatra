/**
 * POST /api/upload — accept multiple file types.
 *
 * Returns: { ok, files: [{url, mime, size, name, kind}] }
 *   kind: 'image' | 'text' | 'pdf' | 'other'
 *
 * - Whitelist by EXTENSION (more reliable than Content-Type, which is
 *   spoofable). We still record the mime the browser sent for display.
 * - 10MB per file max.
 * - Files stored at public/uploads/{userId}/{uuid}.{ext} (already
 *   served dynamically by /uploads/[...path]/route.ts).
 * - Per-user scoping: cannot read another user's files.
 *
 * NOTE: this writes to local disk. Vercel serverless has read-only fs;
 * move the storage backend to S3 / Supabase Storage / Vercel Blob
 * before production deploy. Response shape stays the same.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { currentSessionIdServer, userFromSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Whitelisted extensions. Mime is best-effort (browsers can lie).
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const PDF_EXTS = new Set(['pdf']);
// Text-readable: agent will get the content inline in the chat message.
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'rst',
  'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
  'json', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'env',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'sql', 'graphql', 'gql',
  'csv', 'tsv', 'log',
  'mdx', 'vue', 'svelte', 'rb', 'pyi', 'go', 'rs', 'java', 'kt',
  'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift', 'm', 'mm',
]);
const ALLOWED_EXTS = new Set([
  ...IMAGE_EXTS,
  ...PDF_EXTS,
  ...TEXT_EXTS,
]);

type FileKind = 'image' | 'text' | 'pdf' | 'other';

function kindOf(ext: string): FileKind {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (PDF_EXTS.has(ext)) return 'pdf';
  if (TEXT_EXTS.has(ext)) return 'text';
  return 'other';
}

export async function POST(request: NextRequest) {
  const sid = await currentSessionIdServer();
  const user = await userFromSession(sid);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const files = form.getAll('files').filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (${files.length}). Max ${MAX_FILES}.` },
      { status: 400 },
    );
  }

  const out: Array<{
    url: string;
    mime: string;
    size: number;
    name: string;
    kind: FileKind;
    ext: string;
  }> = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const file of files) {
    const origName = file.name || 'file';
    const ext = origName.includes('.')
      ? origName.split('.').pop()!.toLowerCase()
      : '';

    if (!ext || !ALLOWED_EXTS.has(ext)) {
      errors.push({
        name: origName,
        error: ext
          ? `Unsupported type .${ext}`
          : 'Missing file extension',
      });
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push({
        name: origName,
        error: `Too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB)`,
      });
      continue;
    }
    if (file.size === 0) {
      errors.push({ name: origName, error: 'Empty file' });
      continue;
    }

    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const filename = `${randomUUID()}.${ext}`;
      const userDir = path.join(process.cwd(), 'public', 'uploads', user.id);
      if (!existsSync(userDir)) {
        await mkdir(userDir, { recursive: true });
      }
      const filePath = path.join(userDir, filename);
      await writeFile(filePath, buf);
      out.push({
        url: `/uploads/${user.id}/${filename}`,
        mime: file.type || `application/${ext}`,
        size: file.size,
        name: origName,
        kind: kindOf(ext),
        ext,
      });
    } catch (e) {
      errors.push({
        name: origName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (out.length === 0) {
    return NextResponse.json(
      { error: 'No valid files uploaded', errors },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    files: out,
    errors,
  });
}
