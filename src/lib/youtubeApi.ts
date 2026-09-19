/**
 * Клиент YouTube Data API v3.
 * Официальный, бесплатный. Квота по умолчанию — 10,000 юнитов/день
 * (search.list стоит 100 юнитов за запрос, videos.list — 1 юнит за видео).
 * При активном использовании квоту можно увеличить через заявку в Google
 * Cloud Console — обычно проходит для легитимных use case без вопросов.
 *
 * Получить ключ: console.cloud.google.com → создать проект →
 * включить "YouTube Data API v3" → Credentials → API key.
 */

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

export interface TrendVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  isShort: boolean;
  thumbnailUrl: string;
}

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY не задан');
  return key;
}

/**
 * Топ по категории прямо сейчас в США — chart=mostPopular не принимает
 * ключевые слова, только категорию, поэтому это скорее "что вообще
 * взлетает", а не "что взлетает в моей нише". Для нишевого поиска
 * используй searchByKeyword ниже.
 */
export async function fetchTrendingUS(categoryId?: string, maxResults = 25): Promise<TrendVideo[]> {
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode: 'US',
    maxResults: String(maxResults),
    key: apiKey()
  });
  if (categoryId) params.set('videoCategoryId', categoryId);

  const res = await fetch(`${BASE_URL}/videos?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.items || []).map(mapVideoItem);
}

/**
 * Поиск по ключевым словам ниши, отсортированный по просмотрам.
 * search.list не отдаёт статистику напрямую — второй вызов к videos.list
 * нужен, чтобы получить реальные цифры (views/likes/comments/duration).
 */
export async function searchByKeyword(keyword: string, maxResults = 25): Promise<TrendVideo[]> {
  const searchParams = new URLSearchParams({
    part: 'id',
    q: keyword,
    type: 'video',
    order: 'viewCount',
    regionCode: 'US',
    relevanceLanguage: 'en',
    maxResults: String(maxResults),
    key: apiKey()
  });

  const searchRes = await fetch(`${BASE_URL}/search?${searchParams.toString()}`);
  if (!searchRes.ok) throw new Error(`YouTube search error ${searchRes.status}: ${await searchRes.text()}`);
  const searchJson = await searchRes.json();
  const ids = (searchJson.items || []).map((i: any) => i.id.videoId).filter(Boolean).join(',');
  if (!ids) return [];

  const detailsParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: ids,
    key: apiKey()
  });
  const detailsRes = await fetch(`${BASE_URL}/videos?${detailsParams.toString()}`);
  if (!detailsRes.ok) throw new Error(`YouTube videos error ${detailsRes.status}: ${await detailsRes.text()}`);
  const detailsJson = await detailsRes.json();
  return (detailsJson.items || []).map(mapVideoItem);
}

/**
 * Прямой поиск КАНАЛОВ по теме, не видео — YouTube search.list поддерживает
 * type=channel отдельно от type=video. Возвращает каналы, чей контент в
 * целом релевантен запросу, не только те, что засветились в топе видео.
 *
 * Честно: у публичного API нет данных о росте подписчиков во времени —
 * только текущий снимок. "Трендовость" тут — понимай как "активен и
 * релевантен сейчас", не как подтверждённый быстрый рост.
 */
export async function searchChannelsByKeyword(keyword: string, maxResults = 15): Promise<ChannelInfo[]> {
  const searchParams = new URLSearchParams({
    part: 'id',
    q: keyword,
    type: 'channel',
    order: 'relevance',
    regionCode: 'US',
    relevanceLanguage: 'en',
    maxResults: String(maxResults),
    key: apiKey()
  });

  const searchRes = await fetch(`${BASE_URL}/search?${searchParams.toString()}`);
  if (!searchRes.ok) throw new Error(`YouTube channel search error ${searchRes.status}: ${await searchRes.text()}`);
  const searchJson = await searchRes.json();
  const channelIds = (searchJson.items || []).map((i: any) => i.id.channelId).filter(Boolean);
  if (!channelIds.length) return [];

  return fetchChannelInfo(channelIds);
}

function mapVideoItem(raw: any): TrendVideo {
  return {
    videoId: raw.id,
    title: raw.snippet.title,
    channelTitle: raw.snippet.channelTitle,
    channelId: raw.snippet.channelId,
    publishedAt: raw.snippet.publishedAt,
    viewCount: Number(raw.statistics?.viewCount || 0),
    likeCount: Number(raw.statistics?.likeCount || 0),
    commentCount: Number(raw.statistics?.commentCount || 0),
    durationSeconds: parseISO8601Duration(raw.contentDetails?.duration || 'PT0S'),
    isShort: parseISO8601Duration(raw.contentDetails?.duration || 'PT0S') <= 60,
    thumbnailUrl: raw.snippet.thumbnails?.medium?.url || ''
  };
}

function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h || 0) * 3600) + (Number(m || 0) * 60) + Number(s || 0);
}

/**
 * "Скорость" видео — просмотры в день с момента публикации.
 * Свежее видео с высокой скоростью — сильнее сигнал, чем старое видео
 * с большим количеством просмотров, накопленным за месяцы.
 */
export function computeVelocity(video: TrendVideo): number {
  const ageDays = Math.max(1, (Date.now() - new Date(video.publishedAt).getTime()) / 86400000);
  return video.viewCount / ageDays;
}

export function computeEngagementRate(video: TrendVideo): number {
  if (video.viewCount === 0) return 0;
  return (video.likeCount + video.commentCount) / video.viewCount;
}

export interface ChannelInfo {
  channelId: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  description: string;
}

/**
 * Данные по конкретному каналу — используется, чтобы показать "похожие
 * каналы": берём channelId из топ-видео по нише (searchByKeyword уже
 * это отдаёт) и подтягиваем подписчиков/охват, чтобы отличить крупный
 * устоявшийся канал от свежего растущего — второй интереснее повторить.
 */
export async function fetchChannelInfo(channelIds: string[]): Promise<ChannelInfo[]> {
  if (!channelIds.length) return [];
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    id: channelIds.join(','),
    key: apiKey()
  });
  const res = await fetch(`${BASE_URL}/channels?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube channels error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.items || []).map((raw: any): ChannelInfo => ({
    channelId: raw.id,
    title: raw.snippet?.title || '',
    subscriberCount: Number(raw.statistics?.subscriberCount || 0),
    videoCount: Number(raw.statistics?.videoCount || 0),
    viewCount: Number(raw.statistics?.viewCount || 0),
    description: raw.snippet?.description || ''
  }));
}
