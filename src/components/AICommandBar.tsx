import { useState, useRef, useEffect, useCallback } from 'react';
import { generateSchema } from '../ai/engine';
import { applyAISchema } from '../ai/applySchema';
import { parseAIError } from '../ai/errorHandler';
import { detectLang, type Lang } from '../ai/i18n';
import { useSchemaStore } from '../stores/schemaStore';
import { useSchemaHistoryStore } from '../stores/schemaHistoryStore';
import type { SchemaModel } from '../types';

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
  onSchemaGenerated?: (lang: Lang) => void;
};

export function AICommandBar({ onSchemaGenerated }: Props) {
  const schema = useSchemaStore((s) => s.schema);
  const store = useSchemaStore();
  const addHistoryEntry = useSchemaHistoryStore((s) => s.addEntry);

  const [input, setInput]           = useState('');
  const [status, setStatus]         = useState<Status>('idle');
  const [streamText, setStreamText] = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const [showExamples, setShowExamples]       = useState(false);
  const [retryCountdown, setRetryCountdown]   = useState<number | null>(null);
  const [inputLang, setInputLang]   = useState<Lang>('ar');

  const inputRef     = useRef<HTMLInputElement>(null);
  const streamRef    = useRef('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live countdown timer
  const startCountdown = useCallback((secs: number) => {
    setRetryCountdown(secs);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || status === 'loading' || status === 'streaming') return;

    const lang = detectLang(trimmed);
    setInputLang(lang);

    setStatus('loading');
    setStreamText('');
    setErrorMsg('');
    streamRef.current = '';

    // CRITICAL: Pass empty schema to avoid 413 errors
    // Command Bar is for fresh generation only, not editing
    const emptySchema: SchemaModel = {
      id: '',
      name: 'New Schema',
      description: '',
      version: 0,
      entities: [],
      relationships: [],
      enums: [],
      indexes: [],
    };

    await generateSchema(trimmed, emptySchema, {
      onChunk: (chunk) => {
        streamRef.current = chunk;
        setStreamText(chunk);
        setStatus('streaming');
      },
      onDone: (result) => {
        applyAISchema(result, store);
        const freshSchema = useSchemaStore.getState().schema;
        addHistoryEntry(trimmed, freshSchema);
        onSchemaGenerated?.(lang);
        setStatus('done');
        setInput('');
        setTimeout(() => setStatus('idle'), 3000);
      },
      onError: (err) => {
        const notConfigured = err === 'NO_API_KEY' || err === 'AI_NOT_CONFIGURED';
        const msg = notConfigured
          ? (lang === 'en'
              ? 'AI service is not available right now. Please try again later.'
              : 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول مرة أخرى لاحقاً.')
          : err;
        setErrorMsg(msg);
        setStatus('error');
        const { retryAfterSecs } = parseAIError(JSON.stringify({ error: msg }), lang);
        if (retryAfterSecs) startCountdown(retryAfterSecs);
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
  const statusTitle = inputLang === 'en'
    ? { idle: 'AI ready', loading: 'Processing…', streaming: 'Generating…', done: 'Schema built!', error: 'Error' }[status]
    : { idle: 'AI جاهز', loading: 'جاري المعالجة…', streaming: 'جاري التوليد…', done: 'تم بناء الـ Schema!', error: 'حدث خطأ' }[status];

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
            <span>{inputLang === 'en' ? 'Generating schema…' : 'جاري توليد الـ schema…'}</span>
          </div>
          {streamText && <pre className="stream-text">{streamText}</pre>}
        </div>
      )}

      {/* Error banner */}
      {status === 'error' && errorMsg && (
        <div className="command-error">
          <span>✕</span>
          <span>{errorMsg}</span>
          {retryCountdown !== null && (
            <span className="chat-error-countdown">⏱ {retryCountdown}s</span>
          )}
          <button type="button" onClick={() => { setStatus('idle'); setRetryCountdown(null); }}>
            {inputLang === 'en' ? 'Dismiss' : 'تجاهل'}
          </button>
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
          title="أمثلة"
          onClick={() => setShowExamples((v) => !v)}
        >
          ☰
        </button>

        <input
          ref={inputRef}
          type="text"
          placeholder={inputLang === 'en'
            ? 'Describe your schema… e.g. "Build a school schema with students and teachers"'
            : 'اكتب طلبك… مثلاً: "ابني schema لمدرسة فيها طلاب ومدرسين"'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => !input && setShowExamples(true)}
          disabled={status === 'loading' || status === 'streaming'}
          dir="auto"
        />

        <button
          type="button"
          className="send-btn"
          onClick={handleSubmit}
          disabled={!input.trim() || status === 'loading' || status === 'streaming'}
          title="توليد الـ Schema (Enter)"
        >
          {status === 'loading' || status === 'streaming'
            ? <span className="spin">⟳</span>
            : '↵'}
        </button>
      </footer>
    </div>
  );
}
