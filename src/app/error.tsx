'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 20, fontFamily: 'monospace', color: '#fff', background: '#10131a', minHeight: '100vh' }}>
      <h2 style={{ color: '#e8637a', fontSize: 16, marginBottom: 12 }}>Реальная ошибка (для отладки):</h2>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 16, wordBreak: 'break-word' }}>
        {error.message || 'Без сообщения'}
      </div>
      {error.stack && (
        <details style={{ fontSize: 11, color: '#8992a6', marginBottom: 16 }}>
          <summary>Stack trace</summary>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.stack}</div>
        </details>
      )}
      <button
        onClick={() => reset()}
        style={{ background: '#4c7eff', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px' }}
      >
        Попробовать снова
      </button>
    </div>
  );
}
