import { TrendVideo, computeVelocity, computeEngagementRate } from './youtubeApi';

/**
 * Скоринг идеи для видео на основе того, что уже показывает трэкшн
 * в нише прямо сейчас. Как и в дропшип-скоринге — никаких выдуманных
 * "соберёт 1М просмотров", только сигнал интереса к теме.
 */

export interface IdeaScore {
  video: TrendVideo;
  velocity: number;          // просмотров/день
  engagementRate: number;    // (лайки+комменты)/просмотры
  score: number;             // 0-100
  verdict: string;
}

export function scoreIdeas(videos: TrendVideo[]): IdeaScore[] {
  const velocities = videos.map(computeVelocity);
  const maxVelocity = Math.max(...velocities, 1);

  return videos.map((video, i) => {
    const velocity = velocities[i];
    const engagementRate = computeEngagementRate(video);

    // Нормализуем скорость относительно самого быстрого видео в выборке —
    // абсолютные цифры бессмысленны без контекста ниши.
    const velocityScore = (velocity / maxVelocity) * 70;
    const engagementScore = Math.min(engagementRate * 1000, 30); // 3% engagement = максимум

    const score = Math.round(velocityScore + engagementScore);

    const ageDays = Math.round((Date.now() - new Date(video.publishedAt).getTime()) / 86400000);
    const verdict = `${Math.round(velocity).toLocaleString()} просмотров/день, вышло ${ageDays} дн. назад, ` +
      `engagement ${(engagementRate * 100).toFixed(1)}%. ` +
      (video.isShort ? 'Формат: Shorts.' : 'Формат: лонгформ.');

    return { video, velocity, engagementRate, score, verdict };
  }).sort((a, b) => b.score - a.score);
}
