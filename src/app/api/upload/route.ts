/**
 * POST /api/upload — accept up to 10 image files (multipart/form-data).
 *
 * Per-user scoping: files are stored under public/uploads/{userId}/ so we
 * never serve another user's files. Filename is a uuid + safe extension.
 *
 * NOTE: This writes to the local filesystem. Works in dev (npm run dev /
 * npm run start) and in self-hosted environments. Vercel's serverless
 * runtime has a read-only filesystem, so this WILL need to move to S3 /
 * Supabase Storage / Vercel Blob before production deploy — keep the
 * response shape stable so the swap is just the storage backend.
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
const MAX_BYTES = 5 * 1024 * 1024; // 5MB per file
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const EXT_FOR: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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

  const out: Array<{ url: string; mime: string; size: number }> = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const file of files) {
    if (!ALLOWED_MIME.has(file.type)) {
      errors.push({ name: file.name, error: `Unsupported type ${file.type}` });
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push({
        name: file.name,
        error: `Too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 5MB)`,
      });
      continue;
    }
    if (file.size === 0) {
      errors.push({ name: file.name, error: 'Empty file' });
      continue;
    }

    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = EXT_FOR[file.type] ?? 'bin';
      const filename = `${randomUUID()}.${ext}`;
      const userDir = path.join(process.cwd(), 'public', 'uploads', user.id);
      if (!existsSync(userDir)) {
        await mkdir(userDir, { recursive: true });
      }
      const filePath = path.join(userDir, filename);
      await writeFile(filePath, buf);
      out.push({
        url: `/uploads/${user.id}/${filename}`,
        mime: file.type,
        size: file.size,
      });
    } catch (e) {
      errors.push({
        name: file.name,
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
