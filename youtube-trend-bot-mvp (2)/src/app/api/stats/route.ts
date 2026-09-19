import { NextResponse } from 'next/server';
import { fetchChannelStats } from '@/lib/youtubeAnalytics';

export async function GET() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json(
      { error: 'GOOGLE_REFRESH_TOKEN не задан — пройди /api/auth/google один раз для авторизации' },
      { status: 400 }
    );
  }

  try {
    const stats = await fetchChannelStats(refreshToken);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
