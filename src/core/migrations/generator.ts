/**
 * Migration Generator — diffs two SchemaModel versions and outputs ALTER SQL.
 */
import type { SchemaModel, Entity, Field } from '../../types';

export type MigrationChange =
  | { kind: 'add_table';       entity: Entity }
  | { kind: 'drop_table';      name: string }
  | { kind: 'rename_table';    oldName: string; newName: string }
  | { kind: 'add_column';      table: string; field: Field }
  | { kind: 'drop_column';     table: string; fieldName: string }
  | { kind: 'alter_column';    table: string; fieldName: string; before: Field; after: Field }
  | { kind: 'add_index';       table: string; indexName: string; fields: string[]; unique: boolean }
  | { kind: 'drop_index';      indexName: string }
  | { kind: 'add_enum';        name: string; values: string[] }
  | { kind: 'drop_enum';       name: string }
  | { kind: 'add_enum_value';  enumName: string; value: string };

export type MigrationResult = {
  changes: MigrationChange[];
  sql: string;
  summary: string[];
};

// ─── Type mapping ─────────────────────────────────────────────────────────────

function toSqlType(field: Field): string {
  const t = typeof field.type === 'object' ? 'string' : field.type;
  const map: Record<string, string> = {
    string: 'VARCHAR(255)', text: 'TEXT', integer: 'INTEGER',
    float: 'FLOAT', decimal: 'DECIMAL(12,2)', boolean: 'BOOLEAN',
    date: 'DATE', datetime: 'TIMESTAMPTZ', uuid: 'UUID', json: 'JSONB',
  };
  return map[t] ?? 'TEXT';
}

function colDef(field: Field): string {
  const parts = [toSqlType(field)];
  if (field.primaryKey) parts.push('PRIMARY KEY DEFAULT gen_random_uuid()');
  else if (!field.nullable) parts.push('NOT NULL');
  if (field.unique && !field.primaryKey) parts.push('UNIQUE');
  return parts.join(' ');
}

// ─── Diff engine ──────────────────────────────────────────────────────────────

export function diffSchemas(
  before: SchemaModel,
  after: SchemaModel,
): MigrationResult {
  const changes: MigrationChange[] = [];

  // ── Enums ──
  const beforeEnums = new Map(before.enums.map((e) => [e.name, e]));
  const afterEnums  = new Map(after.enums.map((e)  => [e.name, e]));

  for (const [name, enumDef] of afterEnums) {
    if (!beforeEnums.has(name)) {
      changes.push({ kind: 'add_enum', name, values: enumDef.values });
    } else {
      const prev = beforeEnums.get(name)!;
      for (const v of enumDef.values) {
        if (!prev.values.includes(v)) {
          changes.push({ kind: 'add_enum_value', enumName: name, value: v });
        }
      }
    }
  }
  for (const name of beforeEnums.keys()) {
    if (!afterEnums.has(name)) changes.push({ kind: 'drop_enum', name });
  }

  // ── Tables ──
  const beforeById  = new Map(before.entities.map((e) => [e.id, e]));
  const afterById   = new Map(after.entities.map((e)  => [e.id, e]));
  const beforeNames = new Map(before.entities.map((e) => [e.name, e]));

  for (const afterEntity of after.entities) {
    const prev = beforeById.get(afterEntity.id) ?? beforeNames.get(afterEntity.name);

    if (!prev) {
      changes.push({ kind: 'add_table', entity: afterEntity });
      continue;
    }

    // Renamed?
    if (prev.name !== afterEntity.name) {
      changes.push({ kind: 'rename_table', oldName: prev.name, newName: afterEntity.name });
    }

    // Fields diff
    const prevFields = new Map(prev.fields.map((f) => [f.name, f]));
    const nextFields = new Map(afterEntity.fields.map((f) => [f.name, f]));

    for (const [fname, field] of nextFields) {
      if (!prevFields.has(fname)) {
        changes.push({ kind: 'add_column', table: afterEntity.name, field });
      } else {
        const pf = prevFields.get(fname)!;
        const typeChanged    = JSON.stringify(pf.type) !== JSON.stringify(field.type);
        const nullableChange = pf.nullable !== field.nullable;
        const uniqueChange   = pf.unique   !== field.unique;
        if (typeChanged || nullableChange || uniqueChange) {
          changes.push({ kind: 'alter_column', table: afterEntity.name, fieldName: fname, before: pf, after: field });
        }
      }
    }
    for (const fname of prevFields.keys()) {
      if (!nextFields.has(fname)) {
        changes.push({ kind: 'drop_column', table: afterEntity.name, fieldName: fname });
      }
    }
  }

  for (const beforeEntity of before.entities) {
    if (!afterById.has(beforeEntity.id) && !afterById.get(beforeEntity.id)) {
      const stillExists = after.entities.some(
        (e) => e.name === beforeEntity.name || e.id === beforeEntity.id,
      );
      if (!stillExists) changes.push({ kind: 'drop_table', name: beforeEntity.name });
    }
  }

  // ── Indexes ──
  const prevIdxNames = new Set(before.indexes.map((i) => i.name));
  const nextIdxNames = new Set(after.indexes.map((i) => i.name));

  for (const idx of after.indexes) {
    if (!prevIdxNames.has(idx.name)) {
      const entity = after.entities.find((e) => e.id === idx.entityId);
      if (entity) {
        const fieldNames = idx.fieldIds
          .map((fid) => entity.fields.find((f) => f.id === fid)?.name ?? fid);
        changes.push({ kind: 'add_index', table: entity.name, indexName: idx.name, fields: fieldNames, unique: idx.unique });
      }
    }
  }
  for (const idx of before.indexes) {
    if (!nextIdxNames.has(idx.name)) {
      changes.push({ kind: 'drop_index', indexName: idx.name });
    }
  }

  return {
    changes,
    sql: changesToSQL(changes, after),
    summary: changesToSummary(changes),
  };
}

// ─── SQL generation ───────────────────────────────────────────────────────────

function changesToSQL(changes: MigrationChange[], schema: SchemaModel): string {
  if (changes.length === 0) return '-- No changes detected';

  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lines: string[] = [
    `-- Migration generated by AI Schema Builder`,
    `-- Schema: ${schema.name}  |  Generated: ${ts}`,
    `-- ${changes.length} change(s)`,
    '',
    'BEGIN;',
    '',
  ];

  for (const c of changes) {
    switch (c.kind) {
      case 'add_enum':
        lines.push(`CREATE TYPE ${c.name.toLowerCase()} AS ENUM (${c.values.map((v) => `'${v}'`).join(', ')});`);
        break;
      case 'drop_enum':
        lines.push(`DROP TYPE IF EXISTS ${c.name.toLowerCase()} CASCADE;`);
        break;
      case 'add_enum_value':
        lines.push(`ALTER TYPE ${c.enumName.toLowerCase()} ADD VALUE IF NOT EXISTS '${c.value}';`);
        break;

      case 'add_table': {
        const cols = c.entity.fields.map((f) => `  ${f.name} ${colDef(f)}`).join(',\n');
        lines.push(`CREATE TABLE IF NOT EXISTS ${c.entity.name.toLowerCase()} (\n${cols}\n);`);
        // FK constraints
        for (const f of c.entity.fields) {
          if (!f.primaryKey && f.name.endsWith('Id') && f.type === 'uuid') {
            const ref = f.name.replace(/Id$/, '').toLowerCase();
            lines.push(
              `ALTER TABLE ${c.entity.name.toLowerCase()} ADD CONSTRAINT fk_${c.entity.name.toLowerCase()}_${f.name} FOREIGN KEY (${f.name}) REFERENCES ${ref}(id) ON DELETE SET NULL ON UPDATE CASCADE;`,
            );
          }
        }
        break;
      }
      case 'drop_table':
        lines.push(`DROP TABLE IF EXISTS ${c.name.toLowerCase()} CASCADE;`);
        break;
      case 'rename_table':
        lines.push(`ALTER TABLE ${c.oldName.toLowerCase()} RENAME TO ${c.newName.toLowerCase()};`);
        break;

      case 'add_column':
        lines.push(
          `ALTER TABLE ${c.table.toLowerCase()} ADD COLUMN IF NOT EXISTS ${c.field.name} ${colDef(c.field)};`,
        );
        break;
      case 'drop_column':
        lines.push(`ALTER TABLE ${c.table.toLowerCase()} DROP COLUMN IF EXISTS ${c.fieldName};`);
        break;
      case 'alter_column': {
        const t = c.table.toLowerCase();
        const f = c.after;
        lines.push(`ALTER TABLE ${t} ALTER COLUMN ${f.name} TYPE ${toSqlType(f)} USING ${f.name}::${toSqlType(f)};`);
        if (c.before.nullable && !c.after.nullable)
          lines.push(`ALTER TABLE ${t} ALTER COLUMN ${f.name} SET NOT NULL;`);
        if (!c.before.nullable && c.after.nullable)
          lines.push(`ALTER TABLE ${t} ALTER COLUMN ${f.name} DROP NOT NULL;`);
        if (!c.before.unique && c.after.unique)
          lines.push(`ALTER TABLE ${t} ADD CONSTRAINT uq_${t}_${f.name} UNIQUE (${f.name});`);
        if (c.before.unique && !c.after.unique)
          lines.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS uq_${t}_${f.name};`);
        break;
      }

      case 'add_index': {
        const unique = c.unique ? 'UNIQUE ' : '';
        lines.push(`CREATE ${unique}INDEX IF NOT EXISTS ${c.indexName} ON ${c.table.toLowerCase()} (${c.fields.join(', ')});`);
        break;
      }
      case 'drop_index':
        lines.push(`DROP INDEX IF EXISTS ${c.indexName};`);
        break;
    }
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

function changesToSummary(changes: MigrationChange[]): string[] {
  return changes.map((c) => {
    switch (c.kind) {
      case 'add_table':     return `+ Create table "${c.entity.name}"`;
      case 'drop_table':    return `- Drop table "${c.name}"`;
      case 'rename_table':  return `~ Rename "${c.oldName}" → "${c.newName}"`;
      case 'add_column':    return `+ Add column "${c.field.name}" to "${c.table}"`;
      case 'drop_column':   return `- Drop column "${c.fieldName}" from "${c.table}"`;
      case 'alter_column':  return `~ Alter column "${c.fieldName}" in "${c.table}"`;
      case 'add_index':     return `+ Create index "${c.indexName}" on "${c.table}"`;
      case 'drop_index':    return `- Drop index "${c.indexName}"`;
      case 'add_enum':      return `+ Create enum "${c.name}"`;
      case 'drop_enum':     return `- Drop enum "${c.name}"`;
      case 'add_enum_value':return `+ Add "${c.value}" to enum "${c.enumName}"`;
    }
  });
}
