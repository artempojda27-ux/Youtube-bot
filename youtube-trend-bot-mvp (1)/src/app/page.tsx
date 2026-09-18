'use client';

import { useState, useEffect } from 'react';

interface TrendVideo {
  videoId: string; title: string; channelTitle: string;
  viewCount: number; isShort: boolean; publishedAt: string;
}
interface Idea {
  video: TrendVideo; velocity: number; engagementRate: number; score: number; verdict: string;
}
interface ShortsCut { startTimecode: string; endTimecode: string; hook: string; }
interface ScriptResult {
  title: string; fullScript: string; shortsCuts: ShortsCut[];
  description: string; hashtags: string[];
  aiDisclosureRequired: boolean; aiDisclosureNote: string;
}

interface ChannelInfo {
  channelId: string; title: string; subscriberCount: number;
  videoCount: number; viewCount: number; matchingVideos: number;
}

// Грубая прикидка по известным диапазонам RPM (2026): Shorts $0.03-0.15/1k,
// длинные видео $1-20/1k. Это не прогноз для ЭТОГО видео — это то, что
// принёс бы такой же охват твоему каналу, если повторить формат.
function estimateRevenue(dailyViews: number, isShort: boolean): string {
  const monthlyViews = dailyViews * 30;
  const [rpmLow, rpmHigh] = isShort ? [0.03, 0.15] : [1, 20];
  const low = Math.round((monthlyViews / 1000) * rpmLow);
  const high = Math.round((monthlyViews / 1000) * rpmHigh);
  if (low < 1 && high < 1) return '<$1';
  return `$${low.toLocaleString()}–${high.toLocaleString()}`;
}

export default function Dashboard() {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Record<string, ScriptResult>>({});
  const [generating, setGenerating] = useState(false);
  const [channelStats, setChannelStats] = useState<{ views: number; watchTimeMinutes: number; subscribersGained: number } | null>(null);
  const [myAngle, setMyAngle] = useState('');
  const [showAngleBox, setShowAngleBox] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [videoJobs, setVideoJobs] = useState<Record<string, { status: 'idle' | 'loading' | 'done' | 'error'; videoUrl?: string; error?: string }>>({});

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => data && !data.error && setChannelStats(data))
      .catch(() => {}); // канал может быть ещё не авторизован через OAuth — тихо игнорируем

    // Твой угол подачи хранится локально в браузере — не в базе, это
    // личная настройка, не то, чем делятся между устройствами.
    const savedAngle = localStorage.getItem('yt_my_angle');
    if (savedAngle) setMyAngle(savedAngle);

    // Память между сессиями — этот бот личный, не общий как LEADS, поэтому
    // localStorage достаточно, без Supabase. Восстанавливаем последний
    // поиск и все уже сгенерированные сценарии, чтобы не терять их при
    // закрытии вкладки.
    const savedKeyword = localStorage.getItem('yt_last_keyword');
    const savedIdeas = localStorage.getItem('yt_last_ideas');
    const savedScripts = localStorage.getItem('yt_scripts');
    if (savedKeyword) setKeyword(savedKeyword);
    if (savedIdeas) { try { setIdeas(JSON.parse(savedIdeas)); } catch {} }
    if (savedScripts) { try { setScripts(JSON.parse(savedScripts)); } catch {} }
  }, []);

  // Сохраняем идеи при каждом новом поиске — не через отдельный useEffect,
  // чтобы не писать в localStorage на каждый чих, только когда реально
  // меняется результат поиска.
  useEffect(() => {
    if (ideas.length > 0) {
      localStorage.setItem('yt_last_keyword', keyword);
      localStorage.setItem('yt_last_ideas', JSON.stringify(ideas));
    }
  }, [ideas, keyword]);

  useEffect(() => {
    const ids = Object.keys(scripts);
    if (ids.length === 0) return;
    // Ограничиваем 100 последними сценариями — личный инструмент, но без
    // предела localStorage рано или поздно раздуется без пользы.
    const capped = ids.length > 100
      ? Object.fromEntries(ids.slice(-100).map(id => [id, scripts[id]]))
      : scripts;
    localStorage.setItem('yt_scripts', JSON.stringify(capped));
  }, [scripts]);

  function saveAngle(value: string) {
    setMyAngle(value);
    localStorage.setItem('yt_my_angle', value);
  }

  async function handleSearch() {
    if (!keyword.trim()) return;
    setLoading(true);
    setExpandedId(null);
    setShowChannels(false);
    try {
      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });
      const data = await res.json();
      setIdeas(data.ideas || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleShowChannels() {
    if (!keyword.trim()) return;
    setShowChannels(true);
    if (channels.length === 0) {
      setChannelsLoading(true);
      try {
        const res = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword })
        });
        const data = await res.json();
        setChannels(data.channels || []);
      } finally {
        setChannelsLoading(false);
      }
    }
  }

  async function handleExpand(idea: Idea) {
    const id = idea.video.videoId;
    setExpandedId(expandedId === id ? null : id);

    if (expandedId !== id && !scripts[id]) {
      setGenerating(true);
      try {
        const res = await fetch('/api/script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: idea.video.title,
            // Твой личный угол, если задан, заменяет дефолтный
            // "build in public" — сценарий пишется под твой реальный опыт.
            angle: myAngle.trim() || undefined
          })
        });
        const data = await res.json();
        // Сервер может вернуть {error: "..."} вместо сценария — раньше это
        // слепо клалось в scripts[id] и крашило рендер на script.shortsCuts.map.
        if (!res.ok || data.error || !data.fullScript) {
          setScripts(prev => ({ ...prev, [id]: {
            title: 'Ошибка генерации',
            fullScript: data.error || 'Сервер вернул пустой ответ — попробуй ещё раз.',
            shortsCuts: [],
            description: '', hashtags: [],
            aiDisclosureRequired: false,
            aiDisclosureNote: ''
          }}));
        } else {
          setScripts(prev => ({ ...prev, [id]: { ...data, shortsCuts: data.shortsCuts || [], hashtags: data.hashtags || [] } }));
        }
      } catch (err: any) {
        setScripts(prev => ({ ...prev, [id]: {
          title: 'Ошибка сети',
          fullScript: err.message || 'Не удалось связаться с сервером.',
          shortsCuts: [],
          description: '', hashtags: [],
          aiDisclosureRequired: false,
          aiDisclosureNote: ''
        }}));
      } finally {
        setGenerating(false);
      }
    }
  }

  async function handleGenerateVideo(id: string, fullScript: string) {
    // По умолчанию рендерим только первые ~600 символов (примерно 30-40 сек
    // речи) — полный 8-минутный сценарий на Avatar III стоит меньше доллара,
    // но на дорогом Avatar IV может съесть почти весь баланс за один клик.
    // Тестируй формат коротким куском, потом сам решай, рендерить ли всё.
    const clip = fullScript.length > 600 ? fullScript.slice(0, 600) + '…' : fullScript;
    setVideoJobs(prev => ({ ...prev, [id]: { status: 'loading' } }));
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: clip, quality: 'test' })
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.videoUrl) {
        setVideoJobs(prev => ({ ...prev, [id]: { status: 'error', error: data.error || 'Пустой ответ от сервера' } }));
      } else {
        setVideoJobs(prev => ({ ...prev, [id]: { status: 'done', videoUrl: data.videoUrl } }));
      }
    } catch (err: any) {
      setVideoJobs(prev => ({ ...prev, [id]: { status: 'error', error: err.message || 'Ошибка сети' } }));
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>YT Trend Scout</h1>
        <span className="markets">US audience</span>
      </div>

      {channelStats && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 13 }}>
          <div><span className="cell-label">Просмотры (28д)</span><br /><strong>{channelStats.views.toLocaleString()}</strong></div>
          <div><span className="cell-label">Часы просмотра</span><br /><strong>{Math.round(channelStats.watchTimeMinutes / 60)}</strong></div>
          <div><span className="cell-label">Новых подписчиков</span><br /><strong>{channelStats.subscribersGained}</strong></div>
        </div>
      )}

      <div className="search-row">
        <input
          className="search-input"
          placeholder="Ниша/ключевые слова — напр. «AI side hustle 2026»"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn" onClick={handleSearch} disabled={loading}>
          {loading ? 'Ищу…' : 'Найти'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 }}>
        <button className="btn-secondary btn" style={{ padding: '4px 10px' }} onClick={() => setShowAngleBox(v => !v)}>
          {showAngleBox ? 'Скрыть угол подачи' : 'Мой угол подачи'}
        </button>
        <button className="btn-secondary btn" style={{ padding: '4px 10px' }} onClick={handleShowChannels} disabled={!keyword.trim()}>
          Каналы в этой нише
        </button>
        <button
          className="btn-secondary btn"
          style={{ padding: '4px 10px' }}
          onClick={() => {
            if (!confirm('Стереть сохранённый поиск и все сценарии из этого браузера?')) return;
            localStorage.removeItem('yt_last_keyword');
            localStorage.removeItem('yt_last_ideas');
            localStorage.removeItem('yt_scripts');
            setIdeas([]); setScripts({}); setKeyword('');
          }}
        >
          Очистить сохранённое
        </button>
      </div>

      {showAngleBox && (
        <div style={{ marginBottom: 16 }}>
          <textarea
            className="search-input"
            style={{ width: '100%', minHeight: 70, resize: 'vertical' }}
            placeholder="Опиши свой реальный опыт/угол — напр. «я фулстек-разработчик, строю AI-дропшип и арбитражный бот, показываю процесс изнутри». Сценарии будут писаться под это, а не под общий шаблон."
            value={myAngle}
            onChange={e => saveAngle(e.target.value)}
          />
        </div>
      )}

      {showChannels && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            Каналы по теме, отсортированы по активности в топе выдачи, затем по размеру.
            YouTube API не даёт скорость роста подписчиков — это не подтверждённый "быстрый рост", а близкое к нему: кто сейчас реально заметен по этой теме.
          </div>
          {channelsLoading && <div className="tab-content">Ищу каналы…</div>}
          {!channelsLoading && channels.map(ch => (
            <div key={ch.channelId} className="hook-item">
              <div style={{ fontWeight: 500 }}>{ch.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {ch.subscriberCount.toLocaleString()} подписчиков
                {ch.matchingVideos > 0 ? ` · ${ch.matchingVideos} видео в топе по этой нише` : ' · найден по прямому поиску каналов'}
              </div>
            </div>
          ))}
        </div>
      )}

      {ideas.length > 0 && (
        <>
          <div className="results-count">Найдено: {ideas.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            * Прикидка не про это чужое видео — это то, что принесло бы тебе такой же
            охват, по среднему RPM 2026 года. Реальная цифра зависит от твоей ниши и аудитории.
          </div>
        </>
      )}

      {ideas.length === 0 && !loading && (
        <div className="empty-state">
          Введи нишу — система просканирует, что сейчас растёт быстрее всего
          в этой теме на YouTube США, и предложит темы с уже подтверждённым интересом.
        </div>
      )}

      {ideas.map(idea => {
        const id = idea.video.videoId;
        const script = scripts[id];
        return (
          <div key={id} className="product-row">
            <div className="product-row-head" onClick={() => handleExpand(idea)}>
              <div>
                <div className="product-name">{idea.video.title}</div>
                <div className="product-niche">{idea.video.channelTitle}</div>
              </div>
              <div className="score-cell">
                <div className="score-num">{idea.score}</div>
                <div className="score-bar-track">
                  <div className="score-bar-fill" style={{ width: `${idea.score}%` }} />
                </div>
              </div>
              <div>
                <div className="cell-label">Просмотров/день</div>
                <div className="cell-value">{Math.round(idea.velocity).toLocaleString()}</div>
              </div>
              <div>
                <div className="cell-label">Engagement</div>
                <div className="cell-value">{(idea.engagementRate * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="cell-label">Прикидка/мес*</div>
                <div className="cell-value">{estimateRevenue(idea.velocity, idea.video.isShort)}</div>
              </div>
              <div>{idea.video.isShort ? 'Shorts' : 'Long'}</div>
            </div>

            {expandedId === id && (
              <div className="detail-panel">
                <div className="verdict">{idea.verdict}</div>

                {generating && !script && <div className="tab-content">Пишу сценарий…</div>}

                {script && (
                  <>
                    <div className="missing-data" style={{ marginBottom: 12 }}>
                      {script.aiDisclosureNote}
                    </div>
                    <div style={{ fontWeight: 500, marginBottom: 8 }}>{script.title}</div>
                    <div className="tab-content" style={{ whiteSpace: 'pre-wrap', marginBottom: 20 }}>
                      {script.fullScript}
                    </div>
                    <div style={{ fontWeight: 500, marginBottom: 8 }}>Нарезка для Shorts</div>
                    {script.shortsCuts.map((cut, i) => (
                      <div key={i} className="hook-item">
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {cut.startTimecode}–{cut.endTimecode}
                        </div>
                        <div>«{cut.hook}»</div>
                      </div>
                    ))}

                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color, #2a2a2a)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontWeight: 500 }}>Описание + хэштеги</div>
                        <button
                          className="btn-secondary btn"
                          style={{ padding: '3px 10px', fontSize: 11 }}
                          onClick={() => navigator.clipboard.writeText(
                            `${script.description}\n\n${script.hashtags.map(h => '#' + h).join(' ')}`
                          )}
                        >
                          Скопировать
                        </button>
                      </div>
                      <div className="tab-content" style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                        {script.description}
                      </div>
                      <div style={{ color: 'var(--accent)', fontSize: 12 }}>
                        {script.hashtags.map(h => '#' + h).join(' ')}
                      </div>
                    </div>

                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color, #2a2a2a)' }}>
                      <div style={{ fontWeight: 500, marginBottom: 8 }}>Проверка формата (API, дёшево — ~$0.60/мин)</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                        Только для теста на дешёвом Avatar III — первые ~30-40 сек, чтобы посмотреть на формат вживую.
                        Это не финальный рендер.
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <button
                          className="btn"
                          style={{ padding: '6px 14px', fontSize: 12 }}
                          disabled={videoJobs[id]?.status === 'loading'}
                          onClick={() => handleGenerateVideo(id, script.fullScript)}
                        >
                          {videoJobs[id]?.status === 'loading' ? 'Рендерю (до 5 мин)…' : 'Сгенерировать тест'}
                        </button>
                      </div>
                      {videoJobs[id]?.status === 'error' && (
                        <div className="missing-data">Ошибка: {videoJobs[id].error}</div>
                      )}
                      {videoJobs[id]?.status === 'done' && videoJobs[id].videoUrl && (
                        <video controls src={videoJobs[id].videoUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />
                      )}

                      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--border-color, #2a2a2a)' }}>
                        <div style={{ fontWeight: 500, marginBottom: 6 }}>Финальный рендер — вручную, не через API</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                          Прямой API на Avatar IV — ~$4.83/мин, почти в 5 раз дороже подписки Creator (~$0.97/мин).
                          Для реальной публикации: скопируй сценарий и вставь в app.heygen.com сам, под подпиской.
                        </div>
                        <button
                          className="btn-secondary btn"
                          style={{ padding: '4px 12px', fontSize: 12 }}
                          onClick={() => navigator.clipboard.writeText(script.fullScript)}
                        >
                          Скопировать сценарий для HeyGen
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
