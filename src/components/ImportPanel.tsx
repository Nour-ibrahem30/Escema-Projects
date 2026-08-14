import { useState, useRef } from 'react';
import { importSchema, detectFormat, type ImportFormat } from '../core/import/parser';
import { useSchemaStore } from '../stores/schemaStore';

export function ImportPanel() {
  const loadSchema = useSchemaStore((s) => s.loadSchema);

  const [text, setText]     = useState('');
  const [error, setError]   = useState('');
  const [format, setFormat] = useState<ImportFormat | 'auto'>('auto');
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const detected = text.trim() ? detectFormat(text) : null;

  const handleImport = () => {
    if (!text.trim()) return;
    setError('');
    setSuccess(false);
    try {
      const schema = importSchema(text, format === 'auto' ? undefined : format);
      loadSchema(schema);
      setSuccess(true);
      setText('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse schema');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target?.result as string ?? '');
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="import-panel">
      <div className="inspector-section-header">
        <h3>Import Schema</h3>
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
          📂 Open file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.sql,.prisma,.txt"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      <div className="import-format-row">
        {(['auto', 'json', 'sql', 'prisma'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`export-tab${format === f ? ' active' : ''}`}
            onClick={() => setFormat(f)}
          >
            {f === 'auto' ? `Auto${detected ? ` (${detected})` : ''}` : f.toUpperCase()}
          </button>
        ))}
      </div>

      <textarea
        className="import-textarea"
        placeholder={`Paste your schema here…\n\nSupported formats:\n• JSON (SchemaModel)\n• SQL (CREATE TABLE ...)\n• Prisma schema`}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(''); setSuccess(false); }}
        spellCheck={false}
      />

      {error && (
        <div className="command-error" style={{ borderRadius: '0.375rem', marginTop: '0.5rem' }}>
          <span>✕</span><span>{error}</span>
        </div>
      )}

      {success && (
        <div className="import-success">✓ Schema imported successfully!</div>
      )}

      <button
        type="button"
        className="btn-primary"
        style={{ marginTop: '0.5rem', width: '100%' }}
        disabled={!text.trim()}
        onClick={handleImport}
      >
        Import
      </button>

      <div className="import-examples">
        <p className="guide-hint">Quick examples:</p>
        <button type="button" className="example-item" onClick={() => { setFormat('sql'); setText(SQL_EXAMPLE); }}>
          SQL example
        </button>
        <button type="button" className="example-item" onClick={() => { setFormat('prisma'); setText(PRISMA_EXAMPLE); }}>
          Prisma example
        </button>
      </div>
    </div>
  );
}

const SQL_EXAMPLE = `CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id)
);`;

const PRISMA_EXAMPLE = `model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  name      String
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id        String   @id @default(uuid()) @db.Uuid
  title     String
  body      String?
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}`;
