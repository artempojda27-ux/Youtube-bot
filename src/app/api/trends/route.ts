import { NextResponse } from 'next/server';
import { searchByKeyword } from '@/lib/youtubeApi';
import { scoreIdeas } from '@/lib/scoring';

export async function POST(req: Request) {
  const { keyword } = await req.json();
  if (!keyword) return NextResponse.json({ error: 'keyword обязателен' }, { status: 400 });

  try {
    const videos = await searchByKeyword(keyword);
    const ideas = scoreIdeas(videos);
    return NextResponse.json({ ideas });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
