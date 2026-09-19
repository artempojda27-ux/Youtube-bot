import { NextResponse } from 'next/server';
import { startHeyGenVideo } from '@/lib/video';

/**
 * POST /api/generate-video
 * body: { script, quality? }
 *
 * Только ЗАПУСКАЕТ рендер и сразу отвечает — не ждёт HeyGen внутри
 * функции (это занимает 1-5 мин, а serverless-функции обрываются
 * намного раньше). Статус проверяется отдельным роутом /api/video-status,
 * который браузер опрашивает сам, с интервалом.
 */
export async function POST(req: Request) {
  const { script, quality } = await req.json();
  if (!script) return NextResponse.json({ error: 'script обязателен' }, { status: 400 });

  try {
    const { videoId } = await startHeyGenVideo({ script, quality: quality === 'strong' ? 'strong' : 'test' });
    return NextResponse.json({ videoId, status: 'processing' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
