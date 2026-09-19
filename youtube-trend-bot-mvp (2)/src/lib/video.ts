/**
 * Генерация видео через HeyGen — AI-аватар с лицом читает сценарий.
 * BYOK: ключ и оплата твои (тот же HeyGen-аккаунт, что и в дропшипе,
 * баланс общий на весь аккаунт, не отдельный на каждый проект).
 *
 * quality='test' (по умолчанию) — Avatar III, ~$0.60/мин, для проверки
 * формата на реальном сценарии, прежде чем платить за подписку Creator.
 * quality='strong' — Avatar IV, ~$4.83/мин, ближе к тому, что реально
 * стоит публиковать.
 *
 * ВАЖНО: рендер занимает 1-5 минут, а у Vercel serverless-функций жёсткий
 * лимит на время выполнения (обычно 10-60 сек). Поэтому запуск и опрос
 * статуса — ДВЕ раздельные функции: startHeyGenVideo() отвечает мгновенно
 * с job id, checkHeyGenVideoStatus() — быстрая разовая проверка. Опрос
 * с интервалом делает браузер (у него таких лимитов нет), не сервер.
 *
 * ПОТОЛОК АВТОМАТА: субтитры и свой фон — да, это добавляется кодом.
 * Музыка, темп, B-roll между кадрами — нет, это ручной монтаж после
 * генерации. Ни один сервис сегодня не собирает готовое "кино" одним
 * вызовом API.
 */

export interface GeneratedVideo {
  videoUrl: string;
  status: 'processing' | 'completed' | 'failed';
  providerJobId: string;
}

export interface HeyGenGenerateRequest {
  script: string;
  avatarId?: string;
  language?: string;
  quality?: 'test' | 'strong';
  backgroundImageUrl?: string;
  captions?: boolean;
}

/** Запускает рендер, сразу возвращает job id — не ждёт завершения. */
export async function startHeyGenVideo(input: HeyGenGenerateRequest): Promise<{ videoId: string }> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error('HEYGEN_API_KEY не задан — видео-генерация опциональна (BYOK)');

  const quality = input.quality || 'test';
  const background = input.backgroundImageUrl
    ? { type: 'image', url: input.backgroundImageUrl }
    : { type: 'color', value: '#008000' };

  const createRes = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: input.avatarId || 'Daisy-inskirt-20220818', // дефолтный стоковый — заменить на свой
          avatar_style: quality === 'strong' ? 'closeUp' : 'normal'
        },
        voice: {
          type: 'text',
          input_text: input.script,
          voice_id: 'en-US-JennyNeural'
        },
        background
      }],
      caption: input.captions ?? true,
      dimension: { width: 1920, height: 1080 } // лонгформ 16:9
    })
  });

  if (!createRes.ok) throw new Error(`HeyGen generate error ${createRes.status}: ${await createRes.text()}`);
  const createJson = await createRes.json();
  const videoId = createJson.data?.video_id;
  if (!videoId) throw new Error(`HeyGen не вернул video_id: ${JSON.stringify(createJson)}`);
  return { videoId };
}

/** Разовая проверка статуса — быстрая, безопасная для serverless-таймаутов. */
export async function checkHeyGenVideoStatus(videoId: string): Promise<GeneratedVideo> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error('HEYGEN_API_KEY не задан');

  const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': apiKey }
  });
  if (!statusRes.ok) throw new Error(`HeyGen status error ${statusRes.status}: ${await statusRes.text()}`);
  const statusJson = await statusRes.json();
  const status = statusJson.data?.status;

  if (status === 'completed') {
    return { videoUrl: statusJson.data.video_url, status: 'completed', providerJobId: videoId };
  }
  if (status === 'failed') {
    throw new Error(`HeyGen generation failed: ${JSON.stringify(statusJson.data)}`);
  }
  return { videoUrl: '', status: 'processing', providerJobId: videoId };
}
