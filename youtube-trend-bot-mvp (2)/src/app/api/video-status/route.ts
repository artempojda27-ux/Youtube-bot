import { NextResponse } from 'next/server';
import { checkHeyGenVideoStatus } from '@/lib/video';

/**
 * GET /api/video-status?id=...
 *
 * Разовая быстрая проверка статуса рендера — браузер вызывает это с
 * интервалом (напр. раз в 8 сек), пока не увидит status:"completed".
 * Ни один вызов сюда не ждёт HeyGen — только спрашивает "готово или нет".
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('id');
  if (!videoId) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

  try {
    const result = await checkHeyGenVideoStatus(videoId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message, status: 'failed' }, { status: 500 });
  }
}
