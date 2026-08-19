import { useState } from 'react';
import { isAIAvailable } from '../ai/config';
import { detectLang, type Lang } from '../ai/i18n';
import { jsonrepair } from 'jsonrepair';
import { useSchemaStore } from '../stores/schemaStore';
import type { SchemaModel } from '../types';

type LintSuggestion = {
  severity: 'error' | 'warning' | 'tip';
  title: string;
  detail: string;
  fix?: string;
};

async function runLint(schema: SchemaModel, lang: Lang): Promise<LintSuggestion[]> {
  if (!isAIAvailable()) throw new Error('AI_NOT_CONFIGURED');

  const tables = schema.entities.map((e) => {
    const fields = e.fields
      .map((f) => `  ${f.name}: ${typeof f.type === 'object' ? 'enum' : f.type}${f.primaryKey ? ' PK' : ''}${f.nullable ? '' : ' NOT NULL'}${f.unique ? ' UNIQUE' : ''}`)
      .join('\n');
    return `${e.name}:\n${fields}`;
  }).join('\n\n');

  const rels = schema.relationships.map((r) => {
    const src = schema.entities.find((e) => e.id === r.sourceEntityId)?.name ?? '?';
    const tgt = schema.entities.find((e) => e.id === r.targetEntityId)?.name ?? '?';
    return `${src} → ${tgt} (${r.type})`;
  }).join('\n');

  const replyLang = lang === 'en' ? 'English' : 'Arabic';
  const prompt = `You are a senior database architect reviewing a schema. Provide specific, actionable feedback.

Schema: "${schema.name}"
${schema.description ? `Description: ${schema.description}` : ''}

Tables:
${tables}

Relationships:
${rels || 'None'}

Indexes defined: ${schema.indexes.length}

Analyze and return a JSON array of suggestions:
[
  {
    "severity": "error|warning|tip",
    "title": "short title",
    "detail": "detailed explanation",
    "fix": "what to do"
  }
]

Check for:
- Missing indexes on FK and frequently queried fields
- Missing timestamps (createdAt/updatedAt)
- Fields that should be NOT NULL
- Missing soft-delete (deletedAt) on important entities
- Naming convention issues
- Missing or redundant relationships
- Performance concerns
- Security concerns (password fields, sensitive data)
- Normalization issues

IMPORTANT: Reply in ${replyLang}. Output ONLY the JSON array.`;

  const res = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens:  2048,
      task_type:   'analysis',
      lang,
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = data.choices?.[0]?.message?.content ?? '[]';

  try {
    const fixed = jsonrepair(raw);
    const s = fixed.indexOf('['), e = fixed.lastIndexOf(']');
    if (s === -1 || e === -1) return [];
    return JSON.parse(fixed.slice(s, e + 1)) as LintSuggestion[];
  } catch { return []; }
}

const SEV_ICON  = { error: '✕', warning: '⚠', tip: '💡' };
const SEV_CLASS = { error: 'error', warning: 'warning', tip: 'suggestion' };

export function AILintPanel() {
  const schema  = useSchemaStore((s) => s.schema);
  const hasKey = isAIAvailable();
  const hasData = schema.entities.length > 0;

  const [items, setItems]     = useState<LintSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [ran, setRan]         = useState(false);
  const [lang, setLang]       = useState<Lang>('ar');

  const handleRun = async () => {
    const detectedLang = detectLang(schema.name);
    setLang(detectedLang);
    setLoading(true); setError('');
    try {
      setItems(await runLint(schema, detectedLang));
      setRan(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="lint-panel">
      <div className="inspector-section-header">
        <h3>AI Schema Review</h3>
        <button
          type="button"
          className="btn-primary"
          onClick={handleRun}
          disabled={!hasKey || !hasData || loading}
        >
          {loading ? <span className="spin">⟳</span> : '▶ Run Review'}
        </button>
      </div>

      {!hasKey  && <p className="empty">{lang === 'en' ? 'AI is not configured.' : 'الـ AI غير متاح.'}</p>}
      {!hasData && hasKey && <p className="empty">{lang === 'en' ? 'Build a schema first.' : 'أنشئ schema أولاً.'}</p>}

      {error && (
        <div className="command-error" style={{ borderRadius: '0.375rem', marginTop: '0.5rem' }}>
          <span>✕</span><span>{error}</span>
        </div>
      )}

      {ran && items.length === 0 && !loading && (
        <p className="validation-ok" style={{ marginTop: '0.75rem' }}>
          {lang === 'en' ? '✓ Schema looks great — no issues found!' : '✓ الـ Schema ممتاز — لا توجد مشاكل!'}
        </p>
      )}

      <div className="lint-results">
        {items.map((s, i) => (
          <div key={i} className={`validation-issue ${SEV_CLASS[s.severity]}`}>
            <span className="issue-icon">{SEV_ICON[s.severity]}</span>
            <div style={{ flex: 1 }}>
              <span className="issue-code">{s.title}</span>
              <span className="issue-msg">{s.detail}</span>
              {s.fix && <div className="lint-fix">→ {s.fix}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
