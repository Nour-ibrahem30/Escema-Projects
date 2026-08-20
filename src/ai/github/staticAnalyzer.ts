/**
 * Static Analyzer
 * Extracts schema-relevant information from files WITHOUT calling the AI.
 * JSON, Prisma, SQL, and package.json are parsed deterministically.
 */
import type { AISchemaResponse, AIEntity, AIField, AIRelationship, AIEnum } from '../engine';

export type StaticAnalysisResult = {
  /** Partial schema extracted without AI */
  partialSchema: AISchemaResponse | null;
  /** Files that still need AI analysis */
  remainingFiles: { path: string; content: string; language: string }[];
  /** Summary of what was extracted */
  summary: string[];
};

// ─── Prisma Schema Parser ─────────────────────────────────────────────────────

function parsePrismaSchema(content: string): AISchemaResponse | null {
  const entities: AIEntity[]      = [];
  const relationships: AIRelationship[] = [];
  const enums: AIEnum[]            = [];
  let schemaName = 'Prisma Schema';

  // Parse enums
  const enumRe = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(content)) !== null) {
    const values = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'));
    enums.push({ name: m[1], values });
  }

  // Parse models
  const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
  while ((m = modelRe.exec(content)) !== null) {
    const modelName = m[1];
    const body      = m[2];
    const fields: AIField[] = [];

    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('//') || line.startsWith('@@') || line.startsWith('@')) continue;

      const fm = line.match(/^(\w+)\s+(\w+)(\??)(\[\])?(.*)$/);
      if (!fm) continue;
      const [, fname, ftype, nullable, isList, attrs] = fm;
      if (isList === '[]') continue; // skip relation arrays

      const isPK     = /\@id\b/.test(attrs ?? '');
      const isUnique = /\@unique\b/.test(attrs ?? '');

      const typeMap: Record<string, AIField['type']> = {
        String: 'string', Int: 'integer', Float: 'float', Boolean: 'boolean',
        DateTime: 'datetime', Json: 'json', Decimal: 'decimal',
      };

      const mappedType: AIField['type'] = typeMap[ftype] ?? 'uuid';

      if (isPK || fname === 'id') {
        fields.unshift({
          name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false,
        });
        continue;
      }

      fields.push({
        name: fname,
        type: mappedType,
        primaryKey: false,
        unique: isUnique,
        nullable: nullable === '?',
      });

      // Detect FK → relationship
      if (fname.endsWith('Id') && mappedType === 'uuid') {
        const targetName = fname.replace(/Id$/, '');
        relationships.push({
          sourceName: modelName,
          targetName: targetName.charAt(0).toUpperCase() + targetName.slice(1),
          type: 'many-to-one',
          name: fname,
        });
      }
    }

    if (!fields.some((f) => f.primaryKey)) {
      fields.unshift({ name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false });
    }

    entities.push({ name: modelName, description: `${modelName} model`, fields });
    schemaName = 'Prisma Schema';
  }

  if (entities.length === 0) return null;

  return { schemaName, schemaDescription: `Schema extracted from Prisma schema file`, entities, relationships, enums };
}

// ─── SQL CREATE TABLE Parser ──────────────────────────────────────────────────

function parseSQLSchema(content: string): AISchemaResponse | null {
  const entities: AIEntity[] = [];
  const enums: AIEnum[]      = [];

  // Enums (PostgreSQL)
  const enumRe = /CREATE\s+TYPE\s+["']?(\w+)["']?\s+AS\s+ENUM\s*\(([^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(content)) !== null) {
    const values = m[2].split(',').map((v) => v.trim().replace(/'/g, '').toUpperCase());
    enums.push({ name: toPascal(m[1]), values });
  }

  // Tables
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(([^;]+)\)/gi;
  while ((m = tableRe.exec(content)) !== null) {
    const tableName = toPascal(m[1]);
    const body      = m[2];
    const fields: AIField[] = [];
    const seen = new Set<string>();

    const colLines = body.split(',').map((l) => l.trim()).filter(Boolean);
    for (const col of colLines) {
      if (/^\s*(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX)/i.test(col)) continue;

      const cm = col.match(/^["'`]?(\w+)["'`]?\s+(\w+(?:\s+\w+)*?)(?:\s*\([\d,]+\))?\s*(.*)/i);
      if (!cm) continue;

      const [, cname, rawType, rest] = cm;
      if (seen.has(cname.toLowerCase())) continue;
      seen.add(cname.toLowerCase());

      const isPK      = /PRIMARY\s+KEY/i.test(rest ?? '') || cname.toLowerCase() === 'id';
      const isUnique  = /\bUNIQUE\b/i.test(rest ?? '');
      const isNotNull = /NOT\s+NULL/i.test(rest ?? '') || isPK;

      const sqlTypeMap: Record<string, AIField['type']> = {
        varchar: 'string', text: 'text', char: 'string', nvarchar: 'string',
        int: 'integer', integer: 'integer', bigint: 'integer', smallint: 'integer', serial: 'integer',
        float: 'float', double: 'float', real: 'float',
        decimal: 'decimal', numeric: 'decimal',
        boolean: 'boolean', bool: 'boolean',
        date: 'date', timestamp: 'datetime', timestamptz: 'datetime', datetime: 'datetime',
        uuid: 'uuid', json: 'json', jsonb: 'json',
      };

      const type: AIField['type'] = sqlTypeMap[rawType.toLowerCase().split(' ')[0]] ?? 'string';

      if (isPK && cname.toLowerCase() === 'id') {
        fields.unshift({ name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false });
        continue;
      }

      fields.push({
        name: toCamel(cname),
        type,
        primaryKey: false,
        unique: isUnique,
        nullable: !isNotNull,
      });
    }

    if (!fields.some((f) => f.primaryKey)) {
      fields.unshift({ name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false });
    }

    entities.push({ name: tableName, description: `${tableName} table`, fields });
  }

  if (entities.length === 0) return null;

  return {
    schemaName: 'SQL Schema',
    schemaDescription: 'Schema extracted from SQL migration files',
    entities, relationships: [], enums,
  };
}

// ─── package.json technology detection ───────────────────────────────────────

export type ProjectMeta = {
  name: string;
  description: string;
  framework: string | null;
  orm: string | null;
  database: string | null;
  language: 'typescript' | 'javascript' | 'python' | 'ruby' | 'go' | 'java' | 'php' | 'other';
  dependencies: string[];
};

export function parsePackageJson(content: string): ProjectMeta | null {
  try {
    const pkg = JSON.parse(content) as {
      name?: string;
      description?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    const frameworkMap: [string[], string][] = [
      [['next', 'next.js'], 'Next.js'],
      [['nuxt'], 'Nuxt.js'],
      [['@remix-run/react'], 'Remix'],
      [['@sveltejs/kit', 'svelte'], 'SvelteKit'],
      [['react-router-dom', 'react-router'], 'React Router'],
      [['react'], 'React'],
      [['vue'], 'Vue.js'],
      [['express', '@types/express'], 'Express.js'],
      [['fastify'], 'Fastify'],
      [['nestjs', '@nestjs/core'], 'NestJS'],
      [['hono'], 'Hono'],
    ];

    const ormMap: [string[], string][] = [
      [['@prisma/client', 'prisma'], 'Prisma'],
      [['typeorm'], 'TypeORM'],
      [['sequelize'], 'Sequelize'],
      [['drizzle-orm'], 'Drizzle'],
      [['mongoose'], 'Mongoose'],
      [['knex'], 'Knex'],
    ];

    const dbMap: [string[], string][] = [
      [['pg', 'postgres', '@supabase/supabase-js'], 'PostgreSQL'],
      [['mysql', 'mysql2'], 'MySQL'],
      [['sqlite3', 'better-sqlite3'], 'SQLite'],
      [['mongodb', 'mongoose'], 'MongoDB'],
      [['redis', 'ioredis'], 'Redis'],
    ];

    const detect = (map: [string[], string][]): string | null => {
      for (const [keys, name] of map) {
        if (keys.some((k) => allDeps.some((d) => d === k || d.includes(k)))) return name;
      }
      return null;
    };

    return {
      name: pkg.name ?? 'Unknown Project',
      description: pkg.description ?? '',
      framework: detect(frameworkMap),
      orm: detect(ormMap),
      database: detect(dbMap),
      language: allDeps.includes('typescript') || allDeps.includes('@types/node') ? 'typescript' : 'javascript',
      dependencies: allDeps,
    };
  } catch {
    return null;
  }
}

// ─── Main static analysis entry ───────────────────────────────────────────────

export function runStaticAnalysis(
  files: { path: string; content: string; language: string | null }[],
): StaticAnalysisResult {
  const remaining: { path: string; content: string; language: string }[] = [];
  const summary: string[] = [];
  let partialSchema: AISchemaResponse | null = null;

  for (const file of files) {
    const lang = file.language ?? '';

    if (lang === 'prisma') {
      const result = parsePrismaSchema(file.content);
      if (result) {
        partialSchema = mergePartial(partialSchema, result);
        summary.push(`✓ Parsed Prisma schema → ${result.entities.length} entities`);
        continue;
      }
    }

    if (lang === 'sql') {
      const result = parseSQLSchema(file.content);
      if (result) {
        partialSchema = mergePartial(partialSchema, result);
        summary.push(`✓ Parsed SQL → ${result.entities.length} tables`);
        continue;
      }
    }

    if (file.path.endsWith('package.json')) {
      const meta = parsePackageJson(file.content);
      if (meta) {
        summary.push(
          `✓ package.json: ${meta.framework ?? 'unknown framework'}, ` +
          `ORM: ${meta.orm ?? 'none'}, DB: ${meta.database ?? 'unknown'}`,
        );
        // Keep package.json for AI context too (it's small)
      }
    }

    // Everything else needs AI analysis — include even if language is unknown
    if (file.language) {
      remaining.push({ path: file.path, content: file.content, language: file.language });
    } else {
      // Unknown language — still send to AI with a generic label
      remaining.push({ path: file.path, content: file.content, language: 'source' });
    }
  }

  return { partialSchema, remainingFiles: remaining, summary };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergePartial(base: AISchemaResponse | null, next: AISchemaResponse): AISchemaResponse {
  if (!base) return next;
  const existingNames = new Set(base.entities.map((e) => e.name.toLowerCase()));
  const newEntities   = next.entities.filter((e) => !existingNames.has(e.name.toLowerCase()));
  return {
    schemaName:        base.schemaName,
    schemaDescription: base.schemaDescription,
    entities:          [...base.entities, ...newEntities],
    relationships:     [...base.relationships, ...next.relationships],
    enums:             [...base.enums, ...next.enums],
  };
}

function toPascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
}

function toCamel(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
}
