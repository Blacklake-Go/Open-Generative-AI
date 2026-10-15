import { getUserFromRequest } from '@/lib/services/auth';
import { realtimeEmitter } from '@/lib/ai/queue/realtimeEmitter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events (SSE) endpoint for streaming real-time generation task updates.
 * Clients (Studio or Canvas) subscribe via `new EventSource('/api/generations/events?taskId=...')`
 * completely replacing repetitive polling storms and canvas re-render jitter.
 */
export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Initial connection ping
      sendEvent({ type: 'connected', timestamp: Date.now() });

      const unsubscribe = realtimeEmitter.subscribe(
        { userId: user.id, taskId: taskId || undefined },
        (event) => {
          sendEvent(event);
          if (taskId && (event.status === 'COMPLETED' || event.status === 'FAILED')) {
            setTimeout(() => {
              try { controller.close(); } catch {}
            }, 1000);
          }
        }
      );

      request.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
