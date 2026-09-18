import { NextResponse } from 'next/server';
import { generateScript } from '@/lib/claude';

export async function POST(req: Request) {
  const { topic, angle, niche } = await req.json();

  try {
    const script = await generateScript({
      topic,
      angle: angle || 'build in public — реальный опыт разработки собственного продукта',
      niche: niche || 'tech-ai',
      targetMinutes: 8
    });
    return NextResponse.json(script);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
