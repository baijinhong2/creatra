import { NextRequest } from 'next/server';
import type { ChatMessage } from '@/lib/llm';
import { runAgent } from '@/lib/agent';
import { getDb, TABLE } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = {
  message: string;
  history?: ChatMessage[];
  conversationId?: string;
};

function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '...';
}

async function ensureConversation(
  conversationId: string | undefined,
  firstMessage: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) {
    console.warn('[chat] persistence disabled (no DATABASE_URL)');
    return null;
  }

  if (conversationId) {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM ${TABLE.conversations} WHERE id = $1`,
      [conversationId],
    );
    if (existing.rows[0]?.id) return existing.rows[0].id;
  }

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO ${TABLE.conversations} (title) VALUES ($1) RETURNING id`,
    [titleFromMessage(firstMessage)],
  );
  return inserted.rows[0]?.id ?? null;
}

async function persistMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO ${TABLE.messages} (conversation_id, role, content, metadata) VALUES ($1, $2, $3, $4)`,
      [conversationId, role, content, metadata],
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
    body.conversationId,
    body.message,
  );
  if (conversationId) {
    await persistMessage(conversationId, 'user', body.message);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (obj: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          // controller closed — fine
        }
      };

      // Send the assigned conversationId immediately so the client can
      // persist it to localStorage even before any agent events arrive.
      if (conversationId) {
        enqueue({ type: 'conversation_assigned', conversationId });
      }

      try {
        for await (const event of runAgent(body.message, body.history ?? [])) {
          enqueue(event);
          if (
            conversationId &&
            event.type === 'message_end' &&
            typeof event.content === 'string'
          ) {
            // fire-and-forget — UI shouldn't wait for DB write
            persistMessage(conversationId, 'assistant', event.content);
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (e) {
        const errChunk = `data: ${JSON.stringify({
          type: 'error',
          message: e instanceof Error ? e.message : String(e),
        })}\n\n`;
        try {
          controller.enqueue(encoder.encode(errChunk));
        } catch {
          // already closed
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      usage:
        'POST { message: string, history?: ChatMessage[], conversationId?: string }',
      stream: 'text/event-stream (SSE)',
      events: [
        'conversation_assigned',
        'message_start',
        'message_delta',
        'message_end',
        'tool_start',
        'tool_end',
        'error',
        'done',
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
