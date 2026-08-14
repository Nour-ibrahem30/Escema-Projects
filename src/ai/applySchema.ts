/**
 * Converts an AI-generated schema response into a complete SchemaModel.
 * Builds everything locally first, then commits atomically via store.loadSchema.
 */
import type { AISchemaResponse } from './engine';
import type { SchemaStore } from '../stores/schemaStore';
import type { Field, IndexDefinition, SchemaModel } from '../types';
import { createEmptySchema } from '../core/schema/factory';
import { generateId } from '../utils/id';

// ─── Field type sanitizer ─────────────────────────────────────────────────────

const VALID_TYPES = new Set([
  'string', 'text', 'integer', 'float', 'decimal',
  'boolean', 'date', 'datetime', 'uuid', 'json',
]);

function sanitizeType(t: string | undefined): Field['type'] {
  if (!t) return 'string';
  const lower = t.toLowerCase().trim();
  if (VALID_TYPES.has(lower)) return lower as Field['type'];
  // Aliases
  const aliases: Record<string, Field['type']> = {
    int: 'integer', bigint: 'integer', number: 'integer', serial: 'integer',
    varchar: 'string', char: 'string', nvarchar: 'string',
    timestamp: 'datetime', timestamptz: 'datetime',
    bool: 'boolean',
    double: 'float', real: 'float', numeric: 'decimal',
    jsonb: 'json', object: 'json',
  };
  return aliases[lower] ?? 'string';
}

// ─── Main apply function ──────────────────────────────────────────────────────

export function applyAISchema(
  aiSchema: AISchemaResponse,
  store: SchemaStore,
): void {
  const base = createEmptySchema(
    aiSchema.schemaName?.trim() || 'Generated Schema',
    aiSchema.schemaDescription,
  );

  const schema: SchemaModel = {
    ...base,
    entities: [],
    relationships: [],
    enums: [],
    indexes: [],
    constraints: [],
  };

  // ── 1. Build enums ─────────────────────────────────────────────────────────
  const enumIdByName = new Map<string, string>();

  for (const aiEnum of aiSchema.enums ?? []) {
    if (!aiEnum.name?.trim()) continue;
    const enumId = generateId();
    enumIdByName.set(aiEnum.name.trim().toLowerCase(), enumId);
    schema.enums.push({
      id: enumId,
      name: aiEnum.name.trim(),
      values: (aiEnum.values ?? []).filter(Boolean).map((v) => v.toUpperCase()),
    });
  }

  // ── 2. Build entities & fields ────────────────────────────────────────────
  const entityIdByName = new Map<string, string>();

  for (const aiEntity of aiSchema.entities ?? []) {
    const entityName = aiEntity.name?.trim();
    if (!entityName) continue;

    const entityId = generateId();
    entityIdByName.set(entityName.toLowerCase(), entityId);

    const seenFieldNames = new Set<string>();
    const fields: Field[] = [];

    // Ensure id PK exists first
    fields.push({
      id: generateId(),
      name: 'id',
      type: 'uuid',
      primaryKey: true,
      unique: true,
      nullable: false,
      optional: false,
    });
    seenFieldNames.add('id');

    for (const aiField of aiEntity.fields ?? []) {
      const fieldName = aiField.name?.trim();
      if (!fieldName || fieldName === 'id' || aiField.primaryKey) continue;
      if (seenFieldNames.has(fieldName.toLowerCase())) continue;
      seenFieldNames.add(fieldName.toLowerCase());

      fields.push({
        id: generateId(),
        name: fieldName,
        type: sanitizeType(aiField.type),
        primaryKey: false,
        unique: aiField.unique ?? false,
        nullable: aiField.nullable ?? true,
        optional: aiField.nullable ?? true,
      });
    }

    schema.entities.push({
      id: entityId,
      name: entityName,
      description: aiEntity.description,
      fields,
    });

    // ── Auto-index FK fields ─────────────────────────────────────────────────
    const fkFields = fields.filter(
      (f) => !f.primaryKey && f.name.endsWith('Id') && f.type === 'uuid',
    );
    for (const fkField of fkFields) {
      const index: IndexDefinition = {
        id: generateId(),
        name: `idx_${entityName.toLowerCase()}_${fkField.name}`,
        entityId,
        fieldIds: [fkField.id],
        unique: false,
      };
      schema.indexes.push(index);
    }

    // ── Auto-index unique fields ──────────────────────────────────────────────
    const uniqueFields = fields.filter((f) => f.unique && !f.primaryKey);
    for (const uField of uniqueFields) {
      const index: IndexDefinition = {
        id: generateId(),
        name: `idx_${entityName.toLowerCase()}_${uField.name}_unique`,
        entityId,
        fieldIds: [uField.id],
        unique: true,
      };
      schema.indexes.push(index);
    }
  }

  // ── 3. Build relationships ─────────────────────────────────────────────────
  const relSeen = new Set<string>();

  for (const rel of aiSchema.relationships ?? []) {
    const sourceId = entityIdByName.get(rel.sourceName?.trim().toLowerCase() ?? '');
    const targetId = entityIdByName.get(rel.targetName?.trim().toLowerCase() ?? '');
    if (!sourceId || !targetId) continue;

    // Deduplicate
    const key = `${sourceId}:${targetId}:${rel.type}`;
    if (relSeen.has(key)) continue;
    relSeen.add(key);

    schema.relationships.push({
      id: generateId(),
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      type: rel.type ?? 'one-to-many',
      name: rel.name,
    });
  }

  // ── 4. Commit atomically ──────────────────────────────────────────────────
  store.loadSchema(schema);
}
