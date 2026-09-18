import { NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/youtubeAnalytics';

export async function GET(req: Request) {
  const redirectUri = new URL('/api/auth/google/callback', req.url).toString();
  return NextResponse.redirect(getGoogleAuthUrl(redirectUri));
}
