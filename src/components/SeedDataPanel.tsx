import { useState } from 'react';
import {
  isAIAvailable,
} from '../ai/config';
import { jsonrepair } from 'jsonrepair';
import { useSchemaStore } from '../stores/schemaStore';
import type { SchemaModel } from '../types';

// ─── API call ─────────────────────────────────────────────────────────────────

async function generateSeedData(
  schema: SchemaModel,
  entityName: string,
  count: number,
): Promise<Record<string, unknown>[]> {
  if (!isAIAvailable()) throw new Error('AI_NOT_CONFIGURED');

  const entity = schema.entities.find((e) => e.name === entityName);
  if (!entity) throw new Error('Entity not found');

  const fields = entity.fields
    .filter((f) => !f.primaryKey)
    .map((f) => `${f.name}: ${typeof f.type === 'object' ? 'string' : f.type}${f.nullable ? '?' : ''}`)
    .join(', ');

  const enums = schema.enums
    .map((e) => `${e.name}: [${e.values.join(', ')}]`)
    .join('; ');

  const prompt = `Generate ${count} realistic seed data rows for this database table.

Table: ${entityName}
Fields: ${fields}
${enums ? `Available enums: ${enums}` : ''}
Domain context: ${schema.name} — ${schema.description ?? ''}

Rules:
- Use realistic domain-appropriate values (real-looking names, emails, products etc.)
- UUIDs use lowercase format like "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
- Dates use ISO 8601 format
- For enum fields use one of the valid enum values
- All non-nullable fields must be present
- Respond ONLY with a JSON array of objects, nothing else`;

  const res = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages:  [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens:  2048,
      task_type:   'simple',
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = data.choices?.[0]?.message?.content ?? '[]';

  const fixed   = jsonrepair(raw);
  const start   = fixed.indexOf('[');
  const end     = fixed.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('Could not parse seed data response');
  return JSON.parse(fixed.slice(start, end + 1)) as Record<string, unknown>[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function toSQL(rows: Record<string, unknown>[], table: string): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const vals = rows.map((r) => {
    const v = cols.map((c) => {
      const val = r[c];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      if (typeof val === 'number')  return String(val);
      return `'${String(val).replace(/'/g, "''")}'`;
    });
    return `  (${v.join(', ')})`;
  });
  return `INSERT INTO ${table.toLowerCase()} (${cols.join(', ')})\nVALUES\n${vals.join(',\n')};`;
}

function toTS(rows: Record<string, unknown>[], entity: string): string {
  return `export const ${entity.toLowerCase()}Seeds = ${JSON.stringify(rows, null, 2)} as const;`;
}

function formatOutput(
  rows: Record<string, unknown>[],
  entity: string,
  fmt: 'json' | 'sql' | 'ts',
): string {
  if (fmt === 'sql') return toSQL(rows, entity);
  if (fmt === 'ts')  return toTS(rows, entity);
  return JSON.stringify(rows, null, 2);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SeedDataPanel() {
  const schema = useSchemaStore((s) => s.schema);
  const hasKey = isAIAvailable();
  const hasData = schema.entities.length > 0;

  const [entityName, setEntityName] = useState('');
  const [count, setCount]           = useState(5);
  const [format, setFormat]         = useState<'json' | 'sql' | 'ts'>('json');
  const [rows, setRows]             = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [copied, setCopied]         = useState(false);

  const handleGenerate = async () => {
    if (!entityName) return;
    setLoading(true);
    setError('');
    try {
      const result = await generateSeedData(schema, entityName, count);
      setRows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const output = rows.length > 0 ? formatOutput(rows, entityName, format) : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext  = format === 'sql' ? 'sql' : format === 'ts' ? 'ts' : 'json';
    const blob = new Blob([output], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `seed_${entityName.toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="seed-panel">
      <div className="inspector-section-header">
        <h3>Seed Data Generator</h3>
      </div>

      {!hasKey && <p className="empty">AI requires configuration. In dev, use AI Settings modal.</p>}
      {hasKey && !hasData && <p className="empty">Generate or build a schema first.</p>}

      {hasKey && hasData && (
        <>
          <div className="seed-controls">
            <label className="form-label">
              Entity
              <select
                className="form-select"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
              >
                <option value="">Select entity…</option>
                {schema.entities.map((e) => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Rows
              <input
                type="number"
                className="form-input"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value))))}
              />
            </label>

            <label className="form-label">
              Format
              <select
                className="form-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as 'json' | 'sql' | 'ts')}
              >
                <option value="json">JSON</option>
                <option value="sql">SQL INSERT</option>
                <option value="ts">TypeScript</option>
              </select>
            </label>

            <button
              type="button"
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!entityName || loading}
              style={{ alignSelf: 'flex-end' }}
            >
              {loading ? <span className="spin">⟳</span> : '▶ Generate'}
            </button>
          </div>

          {error && (
            <div className="command-error" style={{ borderRadius: '0.375rem', marginTop: '0.5rem' }}>
              <span>✕</span><span>{error}</span>
            </div>
          )}

          {output && (
            <>
              <div className="export-actions" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button type="button" className="btn-secondary" onClick={handleDownload}>
                  Download
                </button>
              </div>
              <pre className="export-code">{output}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
}
