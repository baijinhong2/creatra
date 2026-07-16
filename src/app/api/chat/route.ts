import { NextRequest } from'next/server';
import type { ChatMessage, ContentPart } from'@/lib/llm';
import { runAgent } from'@/lib/agent';
import { getDb, TABLE } from'@/lib/db';
import {
 currentSessionIdServer,
 userFromSession,
 AuthError,
} from'@/lib/auth';
import { readFile } from'fs/promises';
import path from'path';
// pdf-parse-debugging-disabled is a fork that disables the legacy debug
// entrypoint; both have the same API. We import lazily to keep the
// cold-start footprint smaller. Relative import because this dep
// isn't in package.json (we installed it manually to bypass an npm
// dedup bug with its ^0.0.0 node-ensure dep).
type PdfParseFn = (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number; info: unknown }>;
async function loadPdfParse(): Promise<PdfParseFn> {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const mod = require('pdf-parse-debugging-disabled');
 return (mod.default ?? mod) as PdfParseFn;
}

export const runtime ='nodejs';
export const dynamic ='force-dynamic';

type Attachment = {
 url: string;
 mime: string;
 size: number;
 name?: string;
 kind?:'image'|'text'|'pdf'|'other';
 ext?: string;
};

type RequestBody = {
 message: string;
 history?: ChatMessage[];
 conversationId?: string;
 model?: string;
 attachments?: Attachment[];
 mode?:'auto'|'expert'|'assistant';
};

function titleFromMessage(text: string): string {
 const trimmed = text.trim().replace(/\s+/g,'');
 if (trimmed.length <= 60) return trimmed;
 return trimmed.slice(0, 57) +'...';
}

async function ensureConversation(
 userId: string,
 conversationId: string | undefined,
 firstMessage: string,
 requestedMode:'auto'|'expert'|'assistant'='auto',
): Promise<string | null> {
 const db = getDb();
 if (!db) return null;
 if (conversationId) {
 const existing = await db.query<{ id: string }>(
 `SELECT id FROM ${TABLE.conversations} WHERE id = $1 AND user_id = $2`,
 [conversationId, userId],
 );
 if (existing.rows[0]?.id) return existing.rows[0].id;
 }
 const inserted = await db.query<{ id: string }>(
 `INSERT INTO ${TABLE.conversations} (user_id, title, mode) VALUES ($1, $2, $3) RETURNING id`,
 [userId, titleFromMessage(firstMessage), requestedMode],
 );
 return inserted.rows[0]?.id ?? null;
}

async function getConversationMode(
 userId: string,
 conversationId: string,
): Promise<'auto'|'expert'|'assistant'| null> {
 const db = getDb();
 if (!db) return null;
 try {
 const r = await db.query<{ mode:'auto'|'expert'|'assistant'}>(
 `SELECT mode FROM ${TABLE.conversations} WHERE id = $1 AND user_id = $2`,
 [conversationId, userId],
 );
 return r.rows[0]?.mode ?? null;
 } catch {
 return null;
 }
}

async function persistMessage(
 conversationId: string,
 userId: string,
 role:'user'|'assistant'|'system'|'tool',
 content: string | null,
 metadata: Record<string, unknown> = {},
): Promise<void> {
 const db = getDb();
 if (!db) return;
 try {
 await db.query(
 `INSERT INTO ${TABLE.messages} (conversation_id, user_id, role, content, metadata)
 VALUES ($1, $2, $3, $4, $5)`,
 [conversationId, userId, role, content, metadata],
 );
 await db.query(
 `UPDATE ${TABLE.conversations} SET updated_at = now() WHERE id = $1`,
 [conversationId],
 );
 } catch (e) {
 console.error('[chat] persistMessage failed', role, e);
 }
}

export async function POST(request: NextRequest) {
 // Auth: pull the user from the session set by middleware.
 const sid = await currentSessionIdServer();
 const user = await userFromSession(sid);
 if (!user) {
 return new Response('Unauthorized', { status: 401 });
 }

 let body: RequestBody;
 try {
 body = (await request.json()) as RequestBody;
 } catch {
 return new Response('Invalid JSON', { status: 400 });
 }
 if (!body.message?.trim()) {
 return new Response('message is required', { status: 400 });
 }

 const conversationId = await ensureConversation(
 user.id,
 body.conversationId,
 body.message,
 body.mode,
 );
 if (conversationId) {
 // Persist the user message text + attachment metadata in `metadata`
 // so we can replay history and render thumbnails in the UI.
 const meta: Record<string, unknown> = {};
 if (body.attachments && body.attachments.length > 0) {
 meta.attachments = body.attachments;
 }
 await persistMessage(conversationId, user.id,'user', body.message, meta);
 }

 // Resolve the conversation mode: client-supplied > DB row >'auto'.
 let activeMode:'auto'|'expert'|'assistant'= body.mode ??'auto';
 if (body.conversationId) {
 const fromDb = await getConversationMode(user.id, body.conversationId);
 if (fromDb) activeMode = fromDb;
 }

 // Build the user-message content for the LLM. We always include a text
 // preamble (so the model sees the user's intent + the attachment URLs
 // as plain text references). When the LLM supports image_url content
 // parts (vision), we ALSO include the images as `image_url` parts.
 //
 // Probed 2026-07-12: DeepSeek V4 rejects image_url parts with HTTP 400
 // ("unknown variant `image_url`, expected `text`"). For now, image_url
 // is sent to any model that accepts it (gpt-4o via OpenRouter, etc.)
 // and DeepSeek V4 falls back to the text-only path. If the call to
 // DeepSeek errors out, the agent loop surfaces the error to the UI.
 const hasImages =
 body.attachments?.some((a) => a.mime.startsWith('image/')) ?? false;
 const supportsVision = body.model
 ? body.model.toLowerCase().includes('gpt-4') ||
 body.model.toLowerCase().includes('vision') ||
 body.model.toLowerCase().includes('claude-3')
 : false;

 // Read text content + extract PDF text so the agent can use them inline.
 // Vision images stay as URLs (model can see them with vision support).
 const MAX_TEXT_CHARS = 50_000; // 50KB of text per file is plenty for chat
 const inlineBlocks: string[] = [];
 for (const a of body.attachments ?? []) {
 const filePath = path.join(process.cwd(),'public', a.url);
 const fileName = a.name ?? a.url.split('/').pop() ?? a.url;
 try {
 if (a.kind ==='text') {
 const buf = await readFile(filePath);
 const text = buf.toString('utf-8');
 const truncated = text.length > MAX_TEXT_CHARS;
 const content = truncated
 ? text.slice(0, MAX_TEXT_CHARS) +'\n... [truncated]': text;
 inlineBlocks.push(
 `### 📄 ${fileName} (${a.ext}, ${Math.round(a.size / 1024)}KB)\n\`\`\`${a.ext ??''}\n${content}\n\`\`\``,
 );
 } else if (a.kind ==='pdf') {
 const buf = await readFile(filePath);
 const pdfParse = await loadPdfParse();
 const parsed = await pdfParse(buf);
 const text = parsed.text ??'';
 const truncated = text.length > MAX_TEXT_CHARS;
 const content = truncated
 ? text.slice(0, MAX_TEXT_CHARS) +'\n... [truncated]': text;
 inlineBlocks.push(
 `### 📕 ${fileName} (PDF, ${parsed.numpages} 页, ${Math.round(a.size / 1024)}KB)\n\`\`\`\n${content}\n\`\`\``,
 );
 }
 } catch (e) {
 inlineBlocks.push(
 `### ❌ ${fileName}\n读取失败: ${e instanceof Error ? e.message : String(e)}`,
 );
 }
 }

 const attachmentList = (body.attachments ?? [])
 .map((a) => ` - ${a.name ?? a.url} (${a.mime}, ${Math.round(a.size / 1024)}KB) [${a.kind ??'?'}]`)
 .join('\n');

 let preamble = body.message;
 if (body.attachments && body.attachments.length > 0) {
 preamble += `\n\n[附件 ${body.attachments.length} 个:]\n${attachmentList}`;
 if (inlineBlocks.length > 0) {
 preamble += `\n\n---\n${inlineBlocks.join('\n\n')}`;
 }
 if (hasImages && !supportsVision) {
 preamble += `\n\n(注:agent 当前模型未必能直接看图;如需描述请用户口述)`;
 }
 }

 const userContent: string | ContentPart[] =
 hasImages && supportsVision
 ? [
 { type:'text', text: preamble },
 ...body.attachments!
 .filter((a) => a.mime.startsWith('image/'))
 .map<ContentPart>((a) => ({
 type:'image_url',
 image_url: { url: a.url },
 })),
 ]
 : preamble;

 const encoder = new TextEncoder();
 const stream = new ReadableStream({
 async start(controller) {
 const enqueue = (obj: object) => {
 try {
 controller.enqueue(
 encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
 );
 } catch {
 // controller closed
 }
 };

 if (conversationId) {
 enqueue({ type:'conversation_assigned', conversationId });
 }

 try {
 for await (const event of runAgent(
 userContent,
 body.history ?? [],
 user.id,
 conversationId ?? undefined,
 body.model,
 activeMode,
 )) {
 enqueue(event);
 if (
 conversationId &&
 event.type ==='message_end'&&
 typeof event.content ==='string') {
 persistMessage(conversationId, user.id,'assistant', event.content);
 }
 }
 controller.enqueue(encoder.encode('data: [DONE]\n\n'));
 } catch (e) {
 const err = e instanceof AuthError ?'Unauthorized': e instanceof Error ? e.message : String(e);
 const status = e instanceof AuthError ? 401 : undefined;
 const errChunk = `data: ${JSON.stringify({
 type:'error',
 message: err,
 })}\n\n`;
 try {
 controller.enqueue(encoder.encode(errChunk));
 } catch {
 // already closed
 }
 if (status === 401) {
 try { controller.close(); } catch {}
 return;
 }
 } finally {
 try {
 controller.close();
 } catch {
 // already closed
 }
 }
 },
 });

 return new Response(stream, {
 headers: {'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',
 Connection:'keep-alive','X-Accel-Buffering':'no',
 },
 });
}

export async function GET() {
 return new Response(
 JSON.stringify({
 ok: true,
 usage:'POST { message: string, history?: ChatMessage[], conversationId?: string }',
 stream:'text/event-stream (SSE)',
 auth:'requires session cookie',
 events: ['conversation_assigned','message_start','message_delta','message_end','tool_start','tool_end','error','done',
 ],
 }),
 { headers: {'Content-Type':'application/json'} },
 );
}
