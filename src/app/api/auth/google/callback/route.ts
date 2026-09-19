import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/youtubeAnalytics';

/**
 * После этого шага TODO из lib/youtubeAnalytics.ts: сохранить
 * refresh_token в постоянное хранилище (Supabase), а не выводить
 * его на экран, как сделано здесь для первого разового запуска.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code отсутствует' }, { status: 400 });

  const redirectUri = new URL('/api/auth/google/callback', req.url).toString();

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    // Разовый вывод для ручного копирования в .env.local — заменить
    // на запись в Supabase, когда подключишь базу.
    return NextResponse.json({
      message: 'Скопируй refresh_token в .env.local как GOOGLE_REFRESH_TOKEN',
      refresh_token: tokens.refresh_token
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
