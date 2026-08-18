import { useState } from 'react';
import {
  isAIAvailable,
} from '../ai/config';
import { jsonrepair } from 'jsonrepair';
import { useSchemaStore } from '../stores/schemaStore';
import type { SchemaModel } from '../types';

// ─── API call ─────────────────────────────────────────────────────────────────

type QueryResult = {
  sql: string;
  explanation: string;
};

async function buildQuery(
  schema: SchemaModel,
  question: string,
): Promise<QueryResult> {
  if (!isAIAvailable()) throw new Error('AI_NOT_CONFIGURED');

  const tables = schema.entities.map((e) => {
    const cols = e.fields.map((f) =>
      `  ${f.name} ${typeof f.type === 'object' ? 'VARCHAR' : f.type.toUpperCase()}${f.primaryKey ? ' PK' : ''}${f.nullable ? '' : ' NOT NULL'}`,
    ).join('\n');
    return `${e.name.toLowerCase()} (\n${cols}\n)`;
  }).join('\n\n');

  const rels = schema.relationships.map((r) => {
    const src = schema.entities.find((e) => e.id === r.sourceEntityId)?.name ?? '?';
    const tgt = schema.entities.find((e) => e.id === r.targetEntityId)?.name ?? '?';
    return `${src} ${r.type} ${tgt}`;
  }).join('\n');

  const prompt = `You are a SQL expert. Generate a PostgreSQL query for the following request.

Database Schema:
${tables}

Relationships:
${rels || 'None defined'}

User request: "${question}"

Respond ONLY with a JSON object:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of what this query does (in the same language as the user request)"
}`;

  const res = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = data.choices?.[0]?.message?.content ?? '{}';

  const fixed = jsonrepair(raw);
  return JSON.parse(fixed) as QueryResult;
}

// ─── Component ────────────────────────────────────────────────────────────────

const EXAMPLE_QUERIES = [
  'Get all users with their orders',
  'Find top 10 products by sales',
  'اجلب كل الطلبات المعلقة مع بيانات العميل',
  'Count orders per status grouped by month',
  'Get all students enrolled in a specific course',
];

export function QueryBuilderPanel() {
  const schema  = useSchemaStore((s) => s.schema);
  const hasKey = isAIAvailable();
  const hasData = schema.entities.length > 0;

  const [question, setQuestion] = useState('');
  const [result, setResult]     = useState<QueryResult | null>(null);
  const [history, setHistory]   = useState<Array<{ q: string; r: QueryResult }>>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState(false);

  const handleBuild = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await buildQuery(schema, trimmed);
      setResult(res);
      setHistory((h) => [{ q: trimmed, r: res }, ...h.slice(0, 9)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="query-panel">
      <div className="inspector-section-header">
        <h3>Query Builder</h3>
      </div>

      {!hasKey && <p className="empty">AI requires configuration. In dev, use AI Settings modal.</p>}
      {hasKey && !hasData && <p className="empty">Generate or build a schema first.</p>}

      {hasKey && hasData && (
        <>
          {/* Examples */}
          <div className="query-examples">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                className="example-item"
                onClick={() => setQuestion(q)}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="chat-input-row" style={{ marginTop: '0.5rem' }}>
            <input
              type="text"
              className="chat-input"
              placeholder='اكتب سؤالك… مثلاً "اجلب كل الطلبات مع بيانات المستخدم"'
              value={question}
              dir="auto"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuild()}
              disabled={loading}
            />
            <button
              type="button"
              className="send-btn"
              onClick={handleBuild}
              disabled={!question.trim() || loading}
            >
              {loading ? <span className="spin">⟳</span> : '↵'}
            </button>
          </div>

          {error && (
            <div className="command-error" style={{ borderRadius: '0.375rem', marginTop: '0.5rem' }}>
              <span>✕</span><span>{error}</span>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="query-result">
              <div className="query-explanation">{result.explanation}</div>
              <div className="export-actions">
                <button type="button" className="btn-secondary" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy SQL'}
                </button>
              </div>
              <pre className="export-code">{result.sql}</pre>
            </div>
          )}

          {/* History */}
          {history.length > 1 && (
            <div className="query-history">
              <p className="guide-field-group-label">Recent queries</p>
              {history.slice(1).map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className="example-item"
                  onClick={() => { setQuestion(item.q); setResult(item.r); }}
                >
                  {item.q}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
