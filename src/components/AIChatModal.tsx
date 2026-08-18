import { useState, useRef, useEffect, useCallback } from 'react';
import { sendChatMessage, type ChatMessage } from '../ai/chat';
import { applyPatches } from '../ai/applyPatch';
import { isAIAvailable } from '../ai/config';
import { useSchemaStore } from '../stores/schemaStore';
import { useChatStore } from '../stores/chatStore';
type Props = {
  open: boolean;
  onClose: () => void;
};

const QUICK_ACTIONS = [
  { icon: '🔍', label: 'Review my schema', prompt: 'راجع الـ schema الحالية واقترح تحسينات' },
  { icon: '⚡', label: 'Add indexes', prompt: 'أضف indexes مناسبة لتحسين الـ performance' },
  { icon: '🕒', label: 'Add timestamps', prompt: 'أضف createdAt و updatedAt لكل الـ entities' },
  { icon: '🗑', label: 'Add soft delete', prompt: 'أضف soft delete (deletedAt) للـ entities المهمة' },
  { icon: '🔐', label: 'Security audit', prompt: 'افحص الـ schema من ناحية الأمان وأي مشاكل security' },
  { icon: '📊', label: 'Explain schema', prompt: 'اشرح لي الـ schema الحالية وإيه الغرض من كل جدول' },
];

const GENERAL_QUESTIONS = [
  { icon: '❓', label: 'What is N+1 problem?', prompt: 'What is the N+1 problem and how do I fix it?' },
  { icon: '🔗', label: 'When to use UUID vs INT?', prompt: 'متى أستخدم UUID ومتى أستخدم Integer كـ primary key؟' },
  { icon: '📐', label: 'Normal forms explained', prompt: 'اشرح لي 1NF و 2NF و 3NF بأمثلة بسيطة' },
  { icon: '🚀', label: 'How to optimize slow queries', prompt: 'كيف أحسن أداء الاستعلامات البطيئة في PostgreSQL؟' },
];

export function AIChatModal({ open, onClose }: Props) {
  const schema    = useSchemaStore((s) => s.schema);
  // Use getState() inside handlers so patches always get the LIVE store,
  // not a React-render-time snapshot that may be stale by the time we apply.
  const hasKey    = isAIAvailable();
  const hasSchema = schema.entities.length > 0;

  const {
    conversations,
    activeConversationId,
    newConversation,
    deleteConversation,
    selectConversation,
    addMessage,
    renameConversation,
  } = useChatStore();

  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editVal, setEditVal]       = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null;
  const messages   = activeConv?.messages ?? [];

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Close on Escape
  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  // Ensure there's an active conversation, create one if not
  const ensureConversation = (): string => {
    if (activeConversationId && conversations.find((c) => c.id === activeConversationId)) {
      return activeConversationId;
    }
    return newConversation(schema.name);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !hasKey) return;

    const convId  = ensureConversation();
    // Build history from the current conversation messages
    const currentMessages = useChatStore.getState().conversations
      .find((c) => c.id === convId)?.messages ?? [];
    const history: ChatMessage[] = currentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    addMessage(convId, { role: 'user', content: trimmed, ts: Date.now() });
    setInput('');
    setLoading(true);
    setError('');

    try {
      // Always pass the LIVE schema at call time, not the render-time snapshot
      const liveSchema = useSchemaStore.getState().schema;
      const result = await sendChatMessage(trimmed, history, liveSchema);
      if (result.patches.length > 0) {
        // Pass getState() so applyPatches always reads fresh store state per operation
        applyPatches(result.patches, useSchemaStore.getState());
      }
      addMessage(convId, {
        role: 'assistant',
        content: result.message,
        patches: result.patches.length,
        ts: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    newConversation(schema.name);
    setInput('');
    setError('');
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const emptyState = (
    <div className="chat-empty" style={{ padding: '1.25rem 0.5rem', alignItems: 'flex-start', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <div className="chat-empty-icon" style={{ fontSize: '1.25rem' }}>🤖</div>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
          SchemaAI Assistant
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.875rem' }}>
        {hasSchema
          ? `Schema "${schema.name}" محملة. اسألني أي حاجة — تعديل الـ schema، أسئلة عن الـ DB design، SQL، performance، أو أي حاجة تانية.`
          : 'ولّد schema الأول باستخدام الشريط في الأسفل، أو اسألني أي سؤال عن قواعد البيانات.'}
      </p>

      {hasSchema && (
        <>
          <p className="chat-action-group-label">Schema Actions</p>
          <div className="chat-quick-actions">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                type="button"
                className="chat-quick-btn"
                onClick={() => { setInput(a.prompt); inputRef.current?.focus(); }}
                disabled={!hasKey}
              >
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="chat-action-group-label" style={{ marginTop: '0.75rem' }}>General Questions</p>
      <div className="chat-quick-actions">
        {GENERAL_QUESTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            className="chat-quick-btn"
            onClick={() => { setInput(a.prompt); inputRef.current?.focus(); }}
            disabled={!hasKey}
          >
            <span>{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="chat-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI Chat"
      >
        {/* ── Sidebar: history ── */}
        {sidebarOpen && (
          <aside className="chat-sidebar">
            <div className="chat-sidebar-header">
              <span className="chat-sidebar-title">💬 Chats</span>
              <button type="button" className="btn-primary chat-new-btn" onClick={handleNewChat}>
                + New
              </button>
            </div>

            <div className="chat-sidebar-list">
              {conversations.length === 0 && (
                <p className="chat-sidebar-empty">No conversations yet.</p>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`chat-conv-item${conv.id === activeConversationId ? ' active' : ''}`}
                >
                  {editingId === conv.id ? (
                    <input
                      className="chat-conv-rename"
                      value={editVal}
                      autoFocus
                      onChange={(e) => setEditVal(e.target.value)}
                      onBlur={() => { if (editVal.trim()) renameConversation(conv.id, editVal.trim()); setEditingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { if (editVal.trim()) renameConversation(conv.id, editVal.trim()); setEditingId(null); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="chat-conv-btn"
                      onClick={() => selectConversation(conv.id)}
                      onDoubleClick={() => { setEditingId(conv.id); setEditVal(conv.title); }}
                      title="Double-click to rename"
                    >
                      <span className="chat-conv-title">{conv.title}</span>
                      <span className="chat-conv-meta">
                        {fmtDate(conv.updatedAt)} · {conv.messages.length} msgs
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="chat-conv-delete"
                    onClick={() => deleteConversation(conv.id)}
                    title="Delete conversation"
                  >✕</button>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* ── Main chat area ── */}
        <div className="chat-main">
          {/* Header */}
          <div className="chat-modal-header">
            <button
              type="button"
              className="chat-sidebar-toggle"
              onClick={() => setSidebarOpen((v) => !v)}
              title="Toggle history"
            >
              ☰
            </button>
            <div className="chat-modal-title">
              <span>AI Chat</span>
              {activeConv && (
                <span className="chat-modal-subtitle">— {activeConv.title}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button type="button" className="btn-secondary" onClick={handleNewChat}>
                + New Chat
              </button>
              <button type="button" className="guide-modal-close" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-modal-messages">
            {messages.length === 0 && emptyState}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div className="chat-bubble">
                  <span dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  {msg.role === 'assistant' && msg.patches !== undefined && msg.patches > 0 && (
                    <span className="chat-patch-badge">
                      ✓ {msg.patches} change{msg.patches > 1 ? 's' : ''} applied to schema
                    </span>
                  )}
                </div>
                <span className="chat-msg-time">{fmt(msg.ts)}</span>
              </div>
            ))}

            {loading && (
              <div className="chat-message assistant">
                <div className="chat-bubble loading">
                  <span className="chat-typing">
                    <span /><span /><span />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="chat-error" style={{ margin: '0 1rem' }}>
                <span>✕ {error}</span>
                <button type="button" onClick={() => setError('')}>Dismiss</button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="chat-modal-input">
            {!hasKey && (
              <div className="no-key-banner" style={{ margin: '0 0 0.5rem' }}>
                <span>⚠</span>
                <span>AI Chat requires configuration. In development, add an API key in AI Settings. In production, configure <code>AI_API_KEY</code> on your server.</span>
              </div>
            )}
            <div className="chat-input-row">
              <input
                ref={inputRef}
                type="text"
                className="chat-input"
                placeholder={
                  !hasKey
                    ? 'Configure AI in settings to start chatting…'
                    : 'اسألني أي شيء — schema، SQL، design patterns… (Enter to send)'
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={!hasKey || loading}
                dir="auto"
              />
              <button
                type="button"
                className="send-btn"
                onClick={handleSend}
                disabled={!hasKey || !input.trim() || loading}
                title="Send (Enter)"
              >
                {loading ? <span className="spin">⟳</span> : '↵'}
              </button>
            </div>
            <p className="chat-footer-hint">
              AI Chat edits your schema directly. Use Undo (Ctrl+Z) to revert any change.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
