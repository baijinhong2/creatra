import { NextRequest } from 'next/server';
import type { ChatMessage } from '@/lib/llm';
import { runAgent } from '@/lib/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = {
  message: string;
  history?: ChatMessage[];
};

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

  // SSE response stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(body.message, body.history ?? [])) {
          const chunk = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
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
        controller.close();
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
      usage: 'POST { message: string, history?: ChatMessage[] }',
      stream: 'text/event-stream (SSE)',
      events: ['message_start', 'message_delta', 'message_end', 'tool_start', 'tool_end', 'error', 'done'],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}