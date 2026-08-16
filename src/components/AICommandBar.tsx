import { useState, useRef, useEffect } from 'react';
import { generateSchema } from '../ai/engine';
import { applyAISchema } from '../ai/applySchema';
import { getEffectiveApiKey } from '../ai/config';
import { useSchemaStore } from '../stores/schemaStore';
import { useSchemaHistoryStore } from '../stores/schemaHistoryStore';

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

const EXAMPLE_PROMPTS = [
  'ابني schema لمدرسة فيها طلاب ومدرسين ومواد دراسية',
  'Build a schema for an e-commerce store with products, orders, and users',
  'أنشئ قاعدة بيانات لمستشفى فيها مرضى وأطباء وحجوزات',
  'Create a blog platform schema with posts, comments, tags, and authors',
  'Schema لتطبيق توصيل طلبات زي Talabat',
  'Database for a hotel booking system with rooms, guests, and reservations',
  'Schema لنظام إدارة مشاريع زي Jira',
];

type Props = {
  onSchemaGenerated?: (lang: 'ar' | 'en') => void;
};

function detectLang(text: string): 'ar' | 'en' {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return arabic > text.length * 0.15 ? 'ar' : 'en';
}

export function AICommandBar({ onSchemaGenerated }: Props) {
  const schema = useSchemaStore((s) => s.schema);
  const store = useSchemaStore();
  const addHistoryEntry = useSchemaHistoryStore((s) => s.addEntry);

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [streamText, setStreamText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showExamples, setShowExamples] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef('');

  const hasKey = Boolean(getEffectiveApiKey());

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || status === 'loading' || status === 'streaming') return;
    if (!hasKey) return; // no key — bar is disabled

    setStatus('loading');
    setStreamText('');
    setErrorMsg('');
    streamRef.current = '';

    await generateSchema(trimmed, schema, {
      onChunk: (chunk) => {
        streamRef.current = chunk;
        setStreamText(chunk);
        setStatus('streaming');
      },
      onDone: (result) => {
        applyAISchema(result, store);
        // Save to history — read the fresh schema after applying
        const freshSchema = useSchemaStore.getState().schema;
        addHistoryEntry(trimmed, freshSchema);
        onSchemaGenerated?.(detectLang(input));
        setStatus('done');
        setInput('');
        setTimeout(() => setStatus('idle'), 3000);
      },
      onError: (err) => {
        setErrorMsg(err === 'NO_API_KEY'
          ? 'Add VITE_AI_API_KEY to your .env.local file and restart the dev server.'
          : err,
        );
        setStatus('error');
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') setShowExamples(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.command-bar-wrapper'))
        setShowExamples(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusIcon = { idle: '✦', loading: '⟳', streaming: '⟳', done: '✓', error: '✕' }[status];
  const statusTitle = {
    idle: hasKey ? 'AI ready' : 'No API key — see .env.local',
    loading: 'Thinking…',
    streaming: 'Generating…',
    done: 'Schema built!',
    error: 'Error',
  }[status];

  return (
    <div className="command-bar-wrapper">

      {/* Examples dropdown */}
      {showExamples && (
        <div className="examples-dropdown">
          <p className="examples-label">Try an example</p>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="example-item"
              onClick={() => {
                setInput(prompt);
                setShowExamples(false);
                inputRef.current?.focus();
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Generating indicator */}
      {(status === 'loading' || status === 'streaming') && (
        <div className="stream-preview">
          <div className="stream-header">
            <span className="spin">⟳</span>
            <span>Generating schema…</span>
          </div>
          {streamText && <pre className="stream-text">{streamText}</pre>}
        </div>
      )}

      {/* Error banner */}
      {status === 'error' && errorMsg && (
        <div className="command-error">
          <span>✕</span>
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setStatus('idle')}>Dismiss</button>
        </div>
      )}

      {/* No API key banner */}
      {!hasKey && (
        <div className="no-key-banner">
          <span>⚠</span>
          <span>
            AI is not configured. Create a <code>.env.local</code> file with{' '}
            <code>VITE_AI_API_KEY=your-key</code> and restart the dev server.
            See <code>.env.example</code> for details.
          </span>
        </div>
      )}

      {/* Main bar */}
      <footer className="command-bar">
        <span className={`ai-status-dot ${status}`} title={statusTitle}>
          {statusIcon}
        </span>

        <button
          type="button"
          className="examples-trigger"
          title="Show examples"
          onClick={() => setShowExamples((v) => !v)}
          disabled={!hasKey}
        >
          ☰
        </button>

        <input
          ref={inputRef}
          type="text"
          placeholder={
            hasKey
              ? 'اكتب طلبك… مثلاً: "ابني schema لمدرسة فيها طلاب ومدرسين"'
              : 'Add VITE_AI_API_KEY to .env.local to enable AI…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => hasKey && !input && setShowExamples(true)}
          disabled={!hasKey || status === 'loading' || status === 'streaming'}
          dir="auto"
        />

        <button
          type="button"
          className="send-btn"
          onClick={handleSubmit}
          disabled={!hasKey || !input.trim() || status === 'loading' || status === 'streaming'}
          title="Generate schema (Enter)"
        >
          {status === 'loading' || status === 'streaming'
            ? <span className="spin">⟳</span>
            : '↵'}
        </button>
      </footer>
    </div>
  );
}
