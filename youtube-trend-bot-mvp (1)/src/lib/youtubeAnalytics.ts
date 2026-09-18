/**
 * YouTube Analytics API — статистика ТВОЕГО канала (просмотры, часы
 * просмотра, подписчики, доход). В отличие от Data API (trends),
 * это приватные данные — доступ только через OAuth2, не просто ключ.
 *
 * Настройка (разово):
 * 1. console.cloud.google.com → тот же проект, что для Data API
 * 2. APIs & Services → включить "YouTube Analytics API"
 * 3. Credentials → OAuth client ID (тип: Web application)
 *    redirect URI: https://твой-домен/api/auth/google/callback
 * 4. Пройти /api/auth/google в браузере разово, залогинившись своим
 *    Google-аккаунтом (тем, что владеет каналом) — система сохранит
 *    refresh_token, дальше обновляется сама.
 */

const OAUTH_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';

export function getGoogleAuthUrl(redirectUri: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID не задан');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    access_type: 'offline',   // обязательно для refresh_token
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!res.ok) throw new Error(`Token exchange error: ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }

  // TODO: сохранить refresh_token в Supabase (одна запись — канал один,
  // как и с Shopify-носителем). Плейнтекст в .env не годится для
  // токена, который живёт и обновляется в рантайме.
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) throw new Error(`Token refresh error: ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

export interface ChannelStats {
  periodDays: number;
  views: number;
  watchTimeMinutes: number;
  subscribersGained: number;
  estimatedRevenue?: number; // доступно только после подключения монетизации
}

export async function fetchChannelStats(refreshToken: string, periodDays = 28): Promise<ChannelStats> {
  const accessToken = await refreshAccessToken(refreshToken);

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);

  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,subscribersGained'
  });

  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`YouTube Analytics error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const row = json.rows?.[0] || [0, 0, 0];

  return {
    periodDays,
    views: row[0],
    watchTimeMinutes: row[1],
    subscribersGained: row[2]
    // estimatedRevenue требует отдельный scope yt-analytics-monetary.readonly
    // и доступен только после того, как канал реально принят в YPP
  };
}
