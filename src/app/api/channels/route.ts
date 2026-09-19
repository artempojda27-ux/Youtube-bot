import { NextResponse } from 'next/server';
import { searchByKeyword, searchChannelsByKeyword, fetchChannelInfo, type ChannelInfo } from '@/lib/youtubeApi';

/**
 * POST /api/channels
 * body: { keyword }
 *
 * Два источника, объединённые в один список:
 * 1. Прямой поиск каналов по теме (search.list&type=channel) — широкий охват
 * 2. Агрегация по топ-видео из /api/trends — показывает, кто реально
 *    доминирует в актуальной выдаче по ключевому слову
 *
 * matchingVideos > 0 значит канал засветился среди топ-видео по запросу —
 * это ближе всего к "активен по теме прямо сейчас", что доступно из API.
 */
export async function POST(req: Request) {
  const { keyword } = await req.json();
  if (!keyword) return NextResponse.json({ error: 'keyword обязателен' }, { status: 400 });

  try {
    const [directChannels, videos] = await Promise.all([
      searchChannelsByKeyword(keyword, 15),
      searchByKeyword(keyword, 25)
    ]);

    const uniqueVideoChannelIds = [...new Set(videos.map(v => v.channelId))];
    const alreadyFetchedIds = new Set(directChannels.map(c => c.channelId));
    const missingChannelIds = uniqueVideoChannelIds.filter(id => !alreadyFetchedIds.has(id)).slice(0, 20);
    const extraChannels = missingChannelIds.length ? await fetchChannelInfo(missingChannelIds) : [];

    const merged = new Map<string, ChannelInfo & { matchingVideos: number }>();
    [...directChannels, ...extraChannels].forEach(ch => {
      merged.set(ch.channelId, { ...ch, matchingVideos: 0 });
    });
    videos.forEach(v => {
      const existing = merged.get(v.channelId);
      if (existing) existing.matchingVideos += 1;
    });

    const channelsWithVideoCount = [...merged.values()]
      .sort((a, b) => b.matchingVideos - a.matchingVideos || b.subscriberCount - a.subscriberCount);

    return NextResponse.json({ channels: channelsWithVideoCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
