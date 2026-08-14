import { useState } from 'react';
import type { SchemaModel, Field } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

type ExportFormat = 'postgresql' | 'mysql' | 'sqlite' | 'supabase' | 'prisma' | 'json';
type ERDFormat    = 'svg' | 'png';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  postgresql: 'PostgreSQL',
  mysql:      'MySQL',
  sqlite:     'SQLite',
  supabase:   'Supabase',
  prisma:     'Prisma',
  json:       'JSON',
};

export function ExportPanel() {
  const schema  = useSchemaStore((s) => s.schema);
  const [format, setFormat] = useState<ExportFormat>('postgresql');
  const [copied, setCopied] = useState(false);

  const output = generateExport(schema, format);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap: Record<ExportFormat, string> = {
      postgresql: 'sql', mysql: 'sql', sqlite: 'sql',
      supabase: 'sql', prisma: 'prisma', json: 'json',
    };
    const blob = new Blob([output], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${schema.name.replace(/\s+/g, '_').toLowerCase()}.${extMap[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleERDExport = (fmt: ERDFormat) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.react-flow__renderer canvas');
    const svg    = document.querySelector<SVGElement>('.react-flow__renderer svg');

    if (fmt === 'svg' && svg) {
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${schema.name.replace(/\s+/g, '_')}_erd.svg`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (fmt === 'png' && canvas) {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href    = url;
        a.download = `${schema.name.replace(/\s+/g, '_')}_erd.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
      return;
    }

    // Fallback: generate a simple SVG from schema
    const erdSVG = generateERDSVG(schema);
    const blob   = new Blob([erdSVG], { type: 'image/svg+xml' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `${schema.name.replace(/\s+/g, '_')}_erd.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="export-panel">
      <div className="inspector-section-header">
        <h3>Export</h3>
      </div>

      {/* Format tabs */}
      <div className="export-tabs">
        {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`export-tab${format === f ? ' active' : ''}`}
            onClick={() => setFormat(f)}
          >
            {FORMAT_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="export-actions">
        <button type="button" className="btn-secondary" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleDownload}>
          Download
        </button>
      </div>

      <pre className="export-code">{output}</pre>

      {/* ERD Export */}
      <div className="inspector-section-header" style={{ marginTop: '1rem' }}>
        <h3>ERD Diagram</h3>
      </div>
      <div className="export-actions">
        <button type="button" className="btn-secondary" onClick={() => handleERDExport('svg')}>
          Export SVG
        </button>
        <button type="button" className="btn-secondary" onClick={() => handleERDExport('png')}>
          Export PNG
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtType(field: Field, dialect: ExportFormat): string {
  const t = typeof field.type === 'object' ? 'string' : field.type;
  const maps: Record<ExportFormat, Record<string, string>> = {
    postgresql: {
      string: 'VARCHAR(255)', text: 'TEXT', integer: 'INTEGER', float: 'FLOAT',
      decimal: 'DECIMAL(12,2)', boolean: 'BOOLEAN', date: 'DATE',
      datetime: 'TIMESTAMPTZ', uuid: 'UUID', json: 'JSONB',
    },
    supabase: {
      string: 'VARCHAR(255)', text: 'TEXT', integer: 'INTEGER', float: 'FLOAT',
      decimal: 'DECIMAL(12,2)', boolean: 'BOOLEAN', date: 'DATE',
      datetime: 'TIMESTAMPTZ', uuid: 'UUID', json: 'JSONB',
    },
    mysql: {
      string: 'VARCHAR(255)', text: 'TEXT', integer: 'INT', float: 'FLOAT',
      decimal: 'DECIMAL(12,2)', boolean: 'TINYINT(1)', date: 'DATE',
      datetime: 'DATETIME', uuid: 'CHAR(36)', json: 'JSON',
    },
    sqlite: {
      string: 'TEXT', text: 'TEXT', integer: 'INTEGER', float: 'REAL',
      decimal: 'REAL', boolean: 'INTEGER', date: 'TEXT',
      datetime: 'TEXT', uuid: 'TEXT', json: 'TEXT',
    },
    prisma: {
      string:'String', text:'String', integer:'Int', float:'Float',
      decimal:'Decimal', boolean:'Boolean', date:'DateTime', datetime:'DateTime',
      uuid:'String', json:'Json',
    },
    json: {},
  };
  return maps[dialect][t] ?? 'TEXT';
}

function pkDefault(dialect: ExportFormat): string {
  if (dialect === 'postgresql' || dialect === 'supabase') return ' DEFAULT gen_random_uuid()';
  if (dialect === 'mysql') return '';
  if (dialect === 'sqlite') return '';
  return '';
}

// ─── SQL generators ───────────────────────────────────────────────────────────

function generateSQL(schema: SchemaModel, dialect: ExportFormat): string {
  const isMySQL  = dialect === 'mysql';
  const isSQLite = dialect === 'sqlite';
  const isSupabase = dialect === 'supabase';
  const quote    = isMySQL ? '`' : '"';
  const lines: string[] = [
    `-- Generated by AI Schema Builder`,
    `-- Schema: ${schema.name}  |  Dialect: ${dialect}`,
    `-- ${new Date().toISOString().split('T')[0]}`,
    '',
  ];

  // Supabase: enable UUID extension
  if (isSupabase) {
    lines.push('-- Enable UUID extension (Supabase has this by default)');
    lines.push('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    lines.push('');
  }

  // Enums (PostgreSQL / Supabase only)
  if (!isMySQL && !isSQLite) {
    for (const e of schema.enums) {
      lines.push(`CREATE TYPE ${e.name.toLowerCase()} AS ENUM (`);
      lines.push(e.values.map((v) => `  '${v}'`).join(',\n'));
      lines.push(');');
      lines.push('');
    }
  }

  for (const entity of schema.entities) {
    if (entity.description) lines.push(`-- ${entity.description}`);
    lines.push(`CREATE TABLE ${isSQLite ? '' : 'IF NOT EXISTS '}${quote}${entity.name.toLowerCase()}${quote} (`);
    const cols: string[] = [];

    for (const f of entity.fields) {
      const sqlType = fmtType(f, dialect);
      const parts: string[] = [`  ${quote}${f.name}${quote} ${sqlType}`];
      if (f.primaryKey) {
        if (isSQLite) parts.push('PRIMARY KEY');
        else parts.push(`PRIMARY KEY${pkDefault(dialect)}`);
      } else {
        if (!f.nullable) parts.push('NOT NULL');
        if (f.unique) parts.push('UNIQUE');
      }
      cols.push(parts.join(' '));
    }

    // FK constraints (not SQLite inline)
    if (!isSQLite) {
      for (const f of entity.fields) {
        if (!f.primaryKey && f.name.endsWith('Id') && f.type === 'uuid') {
          const ref = f.name.replace(/Id$/, '').toLowerCase();
          cols.push(
            `  CONSTRAINT fk_${entity.name.toLowerCase()}_${f.name} FOREIGN KEY (${quote}${f.name}${quote}) REFERENCES ${quote}${ref}${quote}(${quote}id${quote}) ON DELETE SET NULL ON UPDATE CASCADE`,
          );
        }
      }
    }

    lines.push(cols.join(',\n'));
    lines.push(');');
    lines.push('');

    // Indexes
    const entIndexes = schema.indexes.filter((i) => i.entityId === entity.id);
    for (const idx of entIndexes) {
      const fnames = idx.fieldIds
        .map((fid) => entity.fields.find((f) => f.id === fid)?.name ?? fid)
        .map((n) => `${quote}${n}${quote}`)
        .join(', ');
      const uniq = idx.unique ? 'UNIQUE ' : '';
      lines.push(`CREATE ${uniq}INDEX IF NOT EXISTS ${idx.name} ON ${quote}${entity.name.toLowerCase()}${quote} (${fnames});`);
    }
    if (entIndexes.length) lines.push('');
  }

  return lines.join('\n');
}

// ─── Prisma generator ─────────────────────────────────────────────────────────

function generatePrisma(schema: SchemaModel): string {
  const lines = [
    '// Generated by AI Schema Builder',
    `// Schema: ${schema.name}`,
    '',
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
    'datasource db {',
    '  provider = "postgresql"',
    '  url      = env("DATABASE_URL")',
    '}',
    '',
  ];

  for (const e of schema.enums) {
    lines.push(`enum ${e.name} {`);
    for (const v of e.values) lines.push(`  ${v}`);
    lines.push('}'); lines.push('');
  }

  for (const entity of schema.entities) {
    if (entity.description) lines.push(`/// ${entity.description}`);
    lines.push(`model ${entity.name} {`);

    for (const f of entity.fields) {
      const pt   = fmtType(f, 'prisma');
      const null_= f.nullable && !f.primaryKey ? '?' : '';
      const attrs: string[] = [];
      if (f.primaryKey)  { attrs.push('@id'); attrs.push('@default(uuid())'); attrs.push('@db.Uuid'); }
      else if (f.type === 'uuid') attrs.push('@db.Uuid');
      if (f.unique && !f.primaryKey) attrs.push('@unique');
      if (f.name === 'createdAt')    attrs.push('@default(now())');
      if (f.name === 'updatedAt')    attrs.push('@updatedAt');
      lines.push(`  ${f.name.padEnd(20)} ${(pt + null_).padEnd(12)}${attrs.length ? ' ' + attrs.join(' ') : ''}`);
    }

    // Relation back-references
    for (const f of entity.fields) {
      if (!f.primaryKey && f.name.endsWith('Id') && f.type === 'uuid') {
        const refName   = f.name.replace(/Id$/, '');
        const refEntity = schema.entities.find((e) => e.name.toLowerCase() === refName.toLowerCase());
        if (refEntity) {
          lines.push(`  ${refName.padEnd(20)} ${refEntity.name.padEnd(12)} @relation(fields: [${f.name}], references: [id])`);
        }
      }
    }

    const outRels = schema.relationships.filter((r) => r.sourceEntityId === entity.id);
    for (const rel of outRels) {
      const tgt = schema.entities.find((e) => e.id === rel.targetEntityId);
      if (!tgt) continue;
      if (rel.type === 'one-to-many') lines.push(`  ${(tgt.name.toLowerCase() + 's').padEnd(20)} ${tgt.name}[]`);
      else if (rel.type === 'one-to-one') lines.push(`  ${tgt.name.toLowerCase().padEnd(20)} ${tgt.name}?`);
    }

    const entIdx = schema.indexes.filter((i) => i.entityId === entity.id && !i.unique);
    if (entIdx.length) {
      lines.push('');
      for (const idx of entIdx) {
        const fnames = idx.fieldIds
          .map((fid) => entity.fields.find((f) => f.id === fid)?.name ?? fid)
          .join(', ');
        lines.push(`  @@index([${fnames}])`);
      }
    }

    lines.push('}'); lines.push('');
  }
  return lines.join('\n');
}

// ─── ERD SVG generator (fallback) ─────────────────────────────────────────────

function generateERDSVG(schema: SchemaModel): string {
  const W = 240, H_HEADER = 36, H_ROW = 22, PAD = 16;
  const cols = 3;

  const entityBoxes = schema.entities.map((entity, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = PAD + col * (W + PAD);
    const y   = PAD + row * (H_HEADER + entity.fields.length * H_ROW + PAD * 2);
    const h   = H_HEADER + entity.fields.length * H_ROW + PAD;
    return { entity, x, y, w: W, h };
  });

  const totalH = Math.max(...entityBoxes.map((b) => b.y + b.h)) + PAD;
  const totalW = cols * (W + PAD) + PAD;

  const rects = entityBoxes.map(({ entity, x, y, w, h }) => {
    const rows = entity.fields.map((f, fi) => {
      const fy = y + H_HEADER + fi * H_ROW;
      const icon = f.primaryKey ? '🔑 ' : f.name.endsWith('Id') ? '🔗 ' : '';
      return `<text x="${x + 8}" y="${fy + 15}" font-size="11" fill="#cbd5e1">${icon}${f.name}: ${typeof f.type === 'object' ? 'enum' : f.type}</text>
<line x1="${x}" y1="${fy}" x2="${x + w}" y2="${fy}" stroke="#1e293b" stroke-width="1"/>`;
    }).join('\n');

    return `
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
<rect x="${x}" y="${y}" width="${w}" height="${H_HEADER}" rx="6" fill="#0f172a" stroke="none"/>
<rect x="${x}" y="${y + 10}" width="${w}" height="${H_HEADER - 10}" fill="#0f172a" stroke="none"/>
<text x="${x + 10}" y="${y + 22}" font-size="13" font-weight="bold" fill="#e2e8f0">${entity.name}</text>
${rows}`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" style="background:#0f172a;font-family:system-ui,sans-serif">
${rects}
</svg>`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function generateExport(schema: SchemaModel, format: ExportFormat): string {
  if (format === 'prisma') return generatePrisma(schema);
  if (format === 'json')   return JSON.stringify(schema, null, 2);
  return generateSQL(schema, format);
}
