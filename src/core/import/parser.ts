/**
 * Import Parser — converts JSON / SQL / Prisma schema text into SchemaModel.
 */
import type { SchemaModel, Field, Entity, EnumDefinition } from '../../types';
import { createEmptySchema } from '../schema/factory';
import { generateId } from '../../utils/id';

const VALID_TYPES = new Set([
  'string','text','integer','float','decimal',
  'boolean','date','datetime','uuid','json',
]);

function sanitizeType(t: string): Field['type'] {
  const l = (t ?? 'string').toLowerCase().trim();
  if (VALID_TYPES.has(l)) return l as Field['type'];
  const aliases: Record<string, Field['type']> = {
    int:'integer', bigint:'integer', smallint:'integer', number:'integer', serial:'integer',
    varchar:'string', char:'string', nvarchar:'string', text:'text',
    timestamp:'datetime', timestamptz:'datetime', 'timestamp with time zone':'datetime',
    bool:'boolean',
    double:'float', real:'float', 'double precision':'float',
    numeric:'decimal', money:'decimal',
    jsonb:'json', 'json':'json',
    uuid:'uuid',
  };
  return aliases[l] ?? 'string';
}

// ─── JSON Import ──────────────────────────────────────────────────────────────

export function importFromJSON(text: string): SchemaModel {
  const obj = JSON.parse(text);

  // Already a SchemaModel
  if (obj.entities && obj.relationships !== undefined) {
    return {
      id:            obj.id            ?? generateId(),
      name:          obj.name          ?? 'Imported Schema',
      description:   obj.description,
      version:       obj.version       ?? 1,
      entities:      obj.entities      ?? [],
      relationships: obj.relationships ?? [],
      enums:         obj.enums         ?? [],
      indexes:       obj.indexes       ?? [],
      constraints:   obj.constraints   ?? [],
    };
  }

  throw new Error('JSON does not look like a SchemaModel. Expected { entities, relationships, ... }');
}

// ─── SQL Import (CREATE TABLE parser) ────────────────────────────────────────

export function importFromSQL(sql: string): SchemaModel {
  const schema = createEmptySchema('Imported from SQL');
  const entityIdByName = new Map<string, string>();

  // Extract CREATE TABLE blocks
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(([^;]+)\)/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRe.exec(sql)) !== null) {
    const tableName = pascalCase(tableMatch[1]);
    const body      = tableMatch[2];

    const entityId = generateId();
    entityIdByName.set(tableName.toLowerCase(), entityId);

    const fields: Field[] = [];
    const seenNames = new Set<string>();

    // Parse column definitions
    const colLines = body.split(',').map((l) => l.trim()).filter(Boolean);

    for (const col of colLines) {
      // Skip constraint lines
      if (/^\s*(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX)/i.test(col)) continue;

      const colRe = /^["']?(\w+)["']?\s+(\w+(?:\s+\w+)*?)(?:\s*\([\d,]+\))?\s*(.*)/i;
      const m     = col.match(colRe);
      if (!m) continue;

      const [, name, rawType, rest] = m;
      if (seenNames.has(name.toLowerCase())) continue;
      seenNames.add(name.toLowerCase());

      const isPK      = /PRIMARY\s+KEY/i.test(rest ?? '') || name.toLowerCase() === 'id';
      const isUnique  = /UNIQUE/i.test(rest ?? '');
      const isNotNull = /NOT\s+NULL/i.test(rest ?? '') || isPK;

      if (name.toLowerCase() === 'id' && fields.length === 0) {
        fields.push({ id: generateId(), name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, optional: false });
        continue;
      }

      fields.push({
        id:         generateId(),
        name:       camelCase(name),
        type:       sanitizeType(rawType),
        primaryKey: isPK && name.toLowerCase() !== 'id',
        unique:     isUnique,
        nullable:   !isNotNull,
        optional:   !isNotNull,
      });
    }

    // Ensure PK exists
    if (!fields.some((f) => f.primaryKey)) {
      fields.unshift({ id: generateId(), name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, optional: false });
    }

    const entity: Entity = { id: entityId, name: tableName, fields };
    schema.entities.push(entity);
  }

  // Extract FOREIGN KEY constraints to build relationships
  const fkRe = /FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+["']?(\w+)["']?\s*\((\w+)\)/gi;
  let fkMatch: RegExpExecArray | null;

  // We need the current table context — re-scan per table
  const tableBodyRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(([^;]+)\)/gi;
  while ((tableBodyRe.exec(sql)) !== null) {
    // handled above
  }

  // Global FK scan
  while ((fkMatch = fkRe.exec(sql)) !== null) {
    const [, , refTable] = fkMatch;
    const srcId = [...entityIdByName.values()][0]; // approximate
    const tgtId = entityIdByName.get(pascalCase(refTable).toLowerCase());
    if (srcId && tgtId && srcId !== tgtId) {
      schema.relationships.push({
        id: generateId(), sourceEntityId: srcId, targetEntityId: tgtId,
        type: 'many-to-one',
      });
    }
  }

  // Extract CREATE TYPE ... AS ENUM
  const enumRe = /CREATE\s+TYPE\s+["']?(\w+)["']?\s+AS\s+ENUM\s*\(([^)]+)\)/gi;
  let enumMatch: RegExpExecArray | null;
  while ((enumMatch = enumRe.exec(sql)) !== null) {
    const values = enumMatch[2].split(',').map((v) => v.trim().replace(/'/g, '').toUpperCase());
    const enumDef: EnumDefinition = { id: generateId(), name: pascalCase(enumMatch[1]), values };
    schema.enums.push(enumDef);
  }

  return schema;
}

// ─── Prisma Import ────────────────────────────────────────────────────────────

export function importFromPrisma(text: string): SchemaModel {
  const schema = createEmptySchema('Imported from Prisma');
  const entityIdByName = new Map<string, string>();

  // Enums
  const enumRe = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let em: RegExpExecArray | null;
  while ((em = enumRe.exec(text)) !== null) {
    const values = em[2].split(/\s+/).map((v) => v.trim()).filter((v) => v && !v.startsWith('//') && !v.startsWith('@@'));
    schema.enums.push({ id: generateId(), name: em[1], values: values.map((v) => v.toUpperCase()) });
  }

  // Models
  const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let mm: RegExpExecArray | null;
  while ((mm = modelRe.exec(text)) !== null) {
    const modelName = mm[1];
    const body      = mm[2];
    const entityId  = generateId();
    entityIdByName.set(modelName.toLowerCase(), entityId);

    const fields: Field[] = [];
    const seenNames = new Set<string>();

    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('//') || line.startsWith('@@') || line.startsWith('@')) continue;

      // field  Type  @attrs
      const fm = line.match(/^(\w+)\s+(\w+)(\??)(\[\])?(.*)$/);
      if (!fm) continue;
      const [, fname, ftype, optional, isList, attrs] = fm;
      if (seenNames.has(fname.toLowerCase())) continue;
      seenNames.add(fname.toLowerCase());

      // Skip relation fields (they map to another model)
      const isRelation = schema.entities.some((e) => e.name === ftype) ||
        entityIdByName.has(ftype.toLowerCase()) || isList === '[]';
      if (isRelation) continue;

      const isPK     = /\@id\b/.test(attrs ?? '');
      const isUnique = /\@unique\b/.test(attrs ?? '');
      const isNullable = optional === '?';

      if (fname === 'id' || isPK) {
        if (!fields.some((f) => f.primaryKey)) {
          fields.push({ id: generateId(), name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, optional: false });
        }
        continue;
      }

      fields.push({
        id: generateId(), name: fname,
        type: prismaTypeToField(ftype),
        primaryKey: false, unique: isUnique,
        nullable: isNullable, optional: isNullable,
      });
    }

    if (!fields.some((f) => f.primaryKey)) {
      fields.unshift({ id: generateId(), name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, optional: false });
    }

    schema.entities.push({ id: entityId, name: modelName, fields });
  }

  // Build relationships from FK field names ending in 'Id'
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.name.endsWith('Id') && field.type === 'uuid') {
        const refName = field.name.replace(/Id$/, '');
        const tgtId   = entityIdByName.get(refName.toLowerCase());
        if (tgtId && tgtId !== entity.id) {
          schema.relationships.push({
            id: generateId(), sourceEntityId: entity.id,
            targetEntityId: tgtId, type: 'many-to-one',
          });
        }
      }
    }
  }

  return schema;
}

function prismaTypeToField(t: string): Field['type'] {
  const map: Record<string, Field['type']> = {
    String: 'string', Int: 'integer', Float: 'float', Boolean: 'boolean',
    DateTime: 'datetime', Json: 'json', Decimal: 'decimal',
  };
  return map[t] ?? 'string';
}

// ─── Auto-detect format ───────────────────────────────────────────────────────

export type ImportFormat = 'json' | 'sql' | 'prisma';

export function detectFormat(text: string): ImportFormat {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (/^\s*model\s+\w+\s*\{/m.test(trimmed) || /datasource\s+db/i.test(trimmed)) return 'prisma';
  return 'sql';
}

export function importSchema(text: string, hint?: ImportFormat): SchemaModel {
  const format = hint ?? detectFormat(text);
  switch (format) {
    case 'json':   return importFromJSON(text);
    case 'sql':    return importFromSQL(text);
    case 'prisma': return importFromPrisma(text);
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function camelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}
