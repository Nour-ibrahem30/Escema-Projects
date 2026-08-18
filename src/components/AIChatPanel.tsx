import { useState, useRef, useEffect } from 'react';
import { sendChatMessage, type ChatMessage } from '../ai/chat';
import { applyPatches } from '../ai/applyPatch';
import { isAIAvailable } from '../ai/config';
import { useSchemaStore } from '../stores/schemaStore';

export function AIChatPanel() {
  const schema = useSchemaStore((s) => s.schema);
  const store  = useSchemaStore();

  const [messages, setMessages] = useState<(ChatMessage & { patches?: number })[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasKey    = isAIAvailable();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasEntities = schema.entities.length > 0;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !hasKey) return;

    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await sendChatMessage(trimmed, history, schema);
      if (result.patches.length > 0) {
        applyPatches(result.patches, store);
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.message, patches: result.patches.length },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const SUGGESTIONS = schema.entities.length > 0 ? [
    `أضف entity للـ notifications`,
    `Add a soft-delete field to all entities`,
    `What indexes should I add to improve performance?`,
    `أضف enum للـ status field في ${schema.entities[0]?.name ?? 'Entity'}`,
    `Rename ${schema.entities[0]?.name ?? 'Entity'} to something more descriptive`,
  ] : [
    `ابني schema لمتجر إلكتروني`,
    `Create a blog schema with posts and comments`,
  ];

  return (
    <div className="chat-panel">
      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>
              {hasEntities
                ? 'Ask me to edit the schema — add entities, fields, relationships, or ask questions about it.'
                : 'Generate a schema first using the AI bar below, then come back here to chat and modify it.'}
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat-suggestion"
                  onClick={() => setInput(s)}
                  disabled={!hasKey}
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
              {msg.role === 'assistant' && msg.patches !== undefined && msg.patches > 0 && (
                <span className="chat-patch-badge">
                  ✓ {msg.patches} change{msg.patches > 1 ? 's' : ''} applied
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-bubble loading">
              <span className="spin">⟳</span> Thinking…
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <span>✕ {error}</span>
            <button type="button" onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          type="text"
          className="chat-input"
          placeholder={
            !hasKey
              ? 'AI requires configuration (see AI Settings)…'
              : !hasEntities
              ? 'Generate a schema first…'
              : 'Ask me to modify the schema…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!hasKey || !hasEntities || loading}
          dir="auto"
        />
        <button
          type="button"
          className="send-btn"
          onClick={handleSend}
          disabled={!hasKey || !hasEntities || !input.trim() || loading}
        >
          {loading ? <span className="spin">⟳</span> : '↵'}
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn-icon"
            title="Clear chat"
            onClick={() => setMessages([])}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
