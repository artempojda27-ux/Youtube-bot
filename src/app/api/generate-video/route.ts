import { NextResponse } from 'next/server';
import { generateVideoWithHeyGen } from '@/lib/video';

/**
 * POST /api/generate-video
 * body: { script }
 *
 * Берёт уже готовый сценарий (из /api/script) и рендерит на Avatar III —
 * дешёвый тест формата перед тем, как платить за подписку Creator.
 */
/**
 * POST /api/generate-video
 * body: { script, quality? }
 *
 * Берёт уже готовый сценарий (из /api/script) и рендерит через HeyGen.
 * quality: 'test' (по умолчанию, Avatar III, дёшево) | 'strong' (Avatar IV, дороже).
 */
export async function POST(req: Request) {
  const { script, quality } = await req.json();
  if (!script) return NextResponse.json({ error: 'script обязателен' }, { status: 400 });

  try {
    const video = await generateVideoWithHeyGen({ script, quality: quality === 'strong' ? 'strong' : 'test' });
    return NextResponse.json({ videoUrl: video.videoUrl, status: video.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
