import { useState, useRef, useEffect, useCallback } from 'react';
import { sendChatMessage, type ChatMessage } from '../ai/chat';
import { applyPatches, type ApplyPatchResult } from '../ai/applyPatch';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from '../ai/config';
import { parseAIError } from '../ai/errorHandler';
import { detectLang, type Lang } from '../ai/i18n';
import { useSchemaStore } from '../stores/schemaStore';
import { useChatStore, type ChatEntry } from '../stores/chatStore';

export function AIChatPanel() {
  const schema = useSchemaStore((s) => s.schema);
  const store  = useSchemaStore();

  // ── chatStore wiring ──────────────────────────────────────────
  const {
    conversations,
    activeConversationId,
    newConversation,
    selectConversation,
    deleteConversation,
    addMessage,
    getActiveMessages,
  } = useChatStore();

  // Ensure there is always an active conversation for this schema
  useEffect(() => {
    if (!activeConversationId) {
      newConversation(schema.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the schema changes (tab switch), start a new conversation if there are none
  const prevSchemaIdRef = useRef(schema.id);
  useEffect(() => {
    if (schema.id !== prevSchemaIdRef.current) {
      prevSchemaIdRef.current = schema.id;
      newConversation(schema.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.id]);

  const messages: ChatEntry[] = getActiveMessages();

  // ── Local UI state ────────────────────────────────────────────
  const [input, setInput]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [selectedModel, setSelectedModel]   = useState(DEFAULT_MODEL_ID);
  const [showModelMenu, setShowModelMenu]   = useState(false);
  const [showHistory, setShowHistory]       = useState(false);
  // Track language of the last sent message for UI localisation
  const [uiLang, setUiLang]                 = useState<Lang>('ar');

  const bottomRef      = useRef<HTMLDivElement>(null);
  const modelMenuRef   = useRef<HTMLDivElement>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Close model menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasEntities = schema.entities.length > 0;
  const selectedModelLabel = AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const lang = detectLang(trimmed);
    setUiLang(lang);

    // Warn for very large requests — suggest using the AI command bar instead
    const isVeryLarge = trimmed.length > 1500;
    if (isVeryLarge) {
      const confirmed = window.confirm(
        lang === 'en'
          ? 'This is a very large request. For best results generating a full schema, use the AI bar at the bottom of the canvas instead. Continue with chat anyway?'
          : 'هذا طلب كبير جداً. للحصول على أفضل نتائج لتوليد schema كامل، استخدم شريط الـ AI في أسفل الـ canvas. هل تريد المتابعة عبر الـ Chat؟',
      );
      if (!confirmed) return;
    }

    // Make sure we have an active conversation
    let convId = activeConversationId;
    if (!convId) {
      convId = newConversation(schema.name);
    }

    // Save user message immediately
    const userEntry: ChatEntry = { role: 'user', content: trimmed, ts: Date.now() };
    addMessage(convId, userEntry);

    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await sendChatMessage(trimmed, history, schema, selectedModel);
      let patchResult: ApplyPatchResult = { applied: 0, failed: 0 };
      if (result.patches.length > 0) {
        patchResult = applyPatches(result.patches, store);
      }
      const assistantEntry: ChatEntry = {
        role:          'assistant',
        content:       result.message,
        patches:       patchResult.applied > 0 ? patchResult.applied : undefined,
        failedPatches: patchResult.failed  > 0 ? patchResult.failed  : undefined,
        modelUsed:     result.modelUsed,
        ts:            Date.now(),
      };
      addMessage(convId, assistantEntry);
    } catch (err) {
      console.error('[AIChatPanel] Error:', err);
      const msg = err instanceof Error ? err.message
        : (uiLang === 'en' ? 'An error occurred. Please try again.' : 'حدث خطأ، حاول مرة أخرى.');
      const { retryAfterSecs } = parseAIError(JSON.stringify({ error: msg }), uiLang);
      setError(msg);
      if (retryAfterSecs) startCountdown(retryAfterSecs);
    } finally {
      setLoading(false);
    }
  };

  const firstName = schema.entities[0]?.name ?? 'Entity';
  const SUGGESTIONS_AR = schema.entities.length > 0 ? [
    `أضف entity للـ notifications`,
    `Add a soft-delete field to all entities`,
    `What indexes should I add to improve performance?`,
    `أضف enum للـ status field في ${firstName}`,
    `Rename ${firstName} to something more descriptive`,
  ] : [
    `ابني schema لمتجر إلكتروني`,
    `Create a blog schema with posts and comments`,
  ];
  const SUGGESTIONS_EN = schema.entities.length > 0 ? [
    `Add a notifications entity`,
    `Add a soft-delete field to all entities`,
    `What indexes should I add to improve performance?`,
    `Add a status enum to ${firstName}`,
    `Rename ${firstName} to something more descriptive`,
  ] : [
    `Build a schema for an e-commerce store`,
    `Create a blog schema with posts and comments`,
  ];
  const SUGGESTIONS = uiLang === 'en' ? SUGGESTIONS_EN : SUGGESTIONS_AR;

  return (
    <div className="chat-panel">

      {/* ── Model selector bar ── */}
      <div className="chat-model-bar" ref={modelMenuRef}>
        <span className="chat-model-label">{uiLang === 'en' ? 'Model:' : 'الـ Model:'}</span>
        <button
          type="button"
          className="chat-model-btn"
          onClick={() => setShowModelMenu((v) => !v)}
          title="اختر الـ model"
        >
          <span className="chat-model-name">{selectedModelLabel}</span>
          <span className="chat-model-arrow">{showModelMenu ? '▲' : '▼'}</span>
        </button>

        {showModelMenu && (
          <div className="chat-model-menu">
            {AVAILABLE_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`chat-model-option${selectedModel === m.id ? ' active' : ''}`}
                onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
              >
                {m.label}
                {selectedModel === m.id && <span className="chat-model-check">✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* Conversation history toggle */}
        <button
          type="button"
          className="chat-history-toggle"
          title={uiLang === 'en' ? 'Saved conversations' : 'المحادثات المحفوظة'}
          onClick={() => setShowHistory((v) => !v)}
        >
          🕐 {conversations.length}
        </button>
      </div>

      {/* ── Conversation history drawer ── */}
      {showHistory && (
        <div className="chat-history-drawer">
          <div className="chat-history-header">
            <span>{uiLang === 'en' ? 'Saved conversations' : 'المحادثات المحفوظة'}</span>
            <button type="button" className="btn-icon" onClick={() => {
              newConversation(schema.name);
              setShowHistory(false);
            }}>
              {uiLang === 'en' ? '＋ New chat' : '＋ محادثة جديدة'}
            </button>
          </div>
          {conversations.length === 0 && (
            <p className="chat-history-empty">
              {uiLang === 'en' ? 'No saved conversations' : 'لا توجد محادثات محفوظة'}
            </p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`chat-history-item${conv.id === activeConversationId ? ' active' : ''}`}
            >
              <button
                type="button"
                className="chat-history-item-btn"
                onClick={() => { selectConversation(conv.id); setShowHistory(false); }}
              >
                <span className="chat-history-title">{conv.title}</span>
                <span className="chat-history-meta">
                  {uiLang === 'en'
                    ? `${conv.messages.length} message${conv.messages.length === 1 ? '' : 's'}`
                    : `${conv.messages.length} رسالة`}
                </span>
              </button>
              <button
                type="button"
                className="chat-history-delete btn-icon danger"
                title={uiLang === 'en' ? 'Delete conversation' : 'حذف المحادثة'}
                onClick={() => deleteConversation(conv.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Messages ── */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>
              {hasEntities
                ? (uiLang === 'en'
                    ? 'Ask me to edit the schema — add entities, fields, relationships, or ask any question.'
                    : 'اسألني لتعديل الـ schema — أضف entities أو fields أو علاقات، أو اسألني أي سؤال.')
                : (uiLang === 'en'
                    ? 'Generate a schema first using the AI bar below, then come back to edit it.'
                    : 'ولّد schema أولاً من شريط الـ AI في الأسفل، ثم ارجع هنا للتعديل.')}
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat-suggestion"
                  onClick={() => setInput(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-bubble">
              <span dir="auto">{msg.content}</span>
              {msg.role === 'assistant' && (
                <div className="chat-message-footer">
                  {msg.patches !== undefined && msg.patches > 0 && (
                    <span className="chat-patch-badge">
                      ✓ {msg.patches} تعديل
                    </span>
                  )}
                  {msg.failedPatches !== undefined && msg.failedPatches > 0 && (
                    <span className="chat-patch-failed" title="بعض التعديلات لم تُطبَّق">
                      ⚠ {msg.failedPatches} فشل
                    </span>
                  )}
                  {msg.modelUsed && (
                    <span className="chat-model-used" title="الـ model الذي أجاب">
                      🤖 {msg.modelUsed.split('/').pop()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-bubble loading">
              <span className="spin">⟳</span> {uiLang === 'en' ? 'Thinking…' : 'جاري التفكير…'}
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <span>✕ {error}</span>
            {retryCountdown !== null && (
              <span className="chat-error-countdown">
                ⏱ {retryCountdown}s
              </span>
            )}
            <button type="button" onClick={() => { setError(''); setRetryCountdown(null); }}>
              {uiLang === 'en' ? 'Dismiss' : 'تجاهل'}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="chat-input-row">
        <input
          type="text"
          className="chat-input"
          placeholder={
            !hasEntities
              ? (uiLang === 'en' ? 'Generate a schema first…' : 'ولّد schema أولاً…')
              : (uiLang === 'en' ? 'Ask me to edit the schema…' : 'اسألني لتعديل الـ schema…')
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!hasEntities || loading}
          dir="auto"
        />
        <button
          type="button"
          className="send-btn"
          onClick={handleSend}
          disabled={!hasEntities || !input.trim() || loading}
        >
          {loading ? <span className="spin">⟳</span> : '↵'}
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn-icon"
            title={uiLang === 'en' ? 'New conversation' : 'محادثة جديدة'}
            onClick={() => newConversation(schema.name)}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
