/**
 * Генерация сценария под формат "AI-аватар с лицом, лонгформ + нарезка
 * на Shorts". Один вызов даёт полный сценарий с таймкодами для нарезки,
 * чтобы не делать монтаж вручную с нуля.
 */

const MODEL = 'claude-sonnet-5';

interface ScriptContext {
  topic: string;
  angle: string;         // например: "build in public" — твой личный опыт, не пересказ чужой темы
  niche: 'business' | 'tech-ai';
  targetMinutes: number; // 8+ для mid-roll рекламы
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не задан');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 6000, // 8-минутный сценарий + нарезка легко упирались в старый лимит 3000, обрезая JSON на середине
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text ?? '';
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned) as T;
}

export interface ShortsCut {
  startTimecode: string;   // "00:45"
  endTimecode: string;     // "01:20"
  hook: string;             // хук для этого конкретного куска, отдельный от основного
}

export interface ScriptResult {
  title: string;
  fullScript: string;       // с таймкодами по секциям
  shortsCuts: ShortsCut[];  // 3-5 кусков для нарезки
  description: string;      // готовое описание под видео на YouTube
  hashtags: string[];       // 5-8 хэштегов без "#", без пробелов внутри
  aiDisclosureRequired: boolean;
  aiDisclosureNote: string;
}

export async function generateScript(ctx: ScriptContext): Promise<ScriptResult> {
  const system = `Ты пишешь сценарии для YouTube-канала на английском для аудитории США.
Формат: говорящий AI-аватар с лицом, лонгформ ${ctx.targetMinutes}+ минут.
Стиль: honest build-in-public — рассказ о реальном опыте создания продукта, не generic listicle.
Верни ТОЛЬКО валидный JSON.`;

  const user = `Тема: ${ctx.topic}
Угол подачи: ${ctx.angle}
Ниша: ${ctx.niche}

Дай:
1. Цепляющий заголовок (для реальной аудитории США, без кликбейта на грани обмана)
2. Полный сценарий с таймкодами по секциям (хук → контекст → основная часть → инсайт → CTA), на английском
3. 3-5 кусков для нарезки в Shorts — каждый со своим отдельным хуком (не совпадающим с хуком лонгформа) и таймкодом начала/конца в исходном видео
4. Готовое описание под видео (2-4 предложения + призыв подписаться, на английском, под копипаст в YouTube Studio)
5. 5-8 хэштегов по теме, без символа "#", без пробелов внутри каждого (напр. "aidropshipping", не "ai dropshipping")

JSON: {
  "title": "...",
  "fullScript": "[00:00] ...\\n[00:45] ...",
  "shortsCuts": [{"startTimecode":"00:45","endTimecode":"01:20","hook":"..."}],
  "description": "...",
  "hashtags": ["...", "..."]
}`;

  const result = parseJson<Omit<ScriptResult, 'aiDisclosureRequired' | 'aiDisclosureNote'>>(
    await callClaude(system, user)
  );

  // AI-аватар с лицом и синтетическим голосом = реалистичный синтетический
  // контент → обязательное раскрытие в YouTube Studio (AI Use field).
  // Финансовые темы получают более заметную плашку прямо на плеере —
  // не только в описании.
  const touchesFinance = ctx.niche === 'business' &&
    /money|earn|income|\$|profit|salary/i.test(ctx.topic + ctx.angle);

  return {
    ...result,
    aiDisclosureRequired: true,
    aiDisclosureNote: touchesFinance
      ? 'Тема касается денег/заработка — YouTube покажет плашку прямо на плеере, не только в описании. Отметь "Yes" в поле AI Use при загрузке.'
      : 'AI-аватар с лицом требует отметки "Yes" в поле AI Use при загрузке — иначе риск санкций за систематическое нераскрытие.'
  };
}
