/**
 * AI Chat — edits the existing schema based on natural language commands.
 * Unlike generateSchema (which replaces the whole schema), chat sends the
 * current schema context and asks the AI to return a PATCH of operations.
 */
import { getEffectiveApiKey, getEffectiveBaseUrl, getEffectiveModel, resolveProxyUrl } from './config';
import { jsonrepair } from 'jsonrepair';
import type { SchemaModel } from '../types';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PatchOp =
  | { op: 'add_entity';       name: string; description?: string; fields?: PatchField[] }
  | { op: 'delete_entity';    name: string }
  | { op: 'rename_entity';    name: string; newName: string }
  | { op: 'add_field';        entity: string; name: string; type: string; nullable?: boolean; unique?: boolean }
  | { op: 'delete_field';     entity: string; name: string }
  | { op: 'update_field';     entity: string; name: string; updates: Partial<PatchField> }
  | { op: 'add_relationship'; sourceName: string; targetName: string; type: string; name?: string }
  | { op: 'delete_relationship'; sourceName: string; targetName: string }
  | { op: 'add_enum';         name: string; values: string[] }
  | { op: 'delete_enum';      name: string }
  | { op: 'add_enum_value';   enumName: string; value: string }
  | { op: 'rename_schema';    name: string };

export type PatchField = {
  name: string;
  type: string;
  nullable?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
};

export type ChatResponse = {
  message: string;
  patches: PatchOp[];
};

const CHAT_SYSTEM_PROMPT = `You are a senior database architect and full-stack engineering assistant embedded inside a visual schema builder tool called SchemaAI.

You have TWO roles:
1. SCHEMA EDITOR — modify the current database schema via patch operations
2. GENERAL ASSISTANT — answer any question about databases, backend dev, SQL, ORMs, design patterns, performance, security, etc.

══════════════════════════════════════════
RESPONSE FORMAT — always return valid JSON:
{
  "message": "Your response here (in the SAME language as the user)",
  "patches": []   ← empty array if no schema changes needed
}

PATCH OPERATIONS (use when user asks to modify the schema):
- { "op": "add_entity", "name": "EntityName", "description": "...", "fields": [{name, type, nullable, unique, primaryKey}] }
- { "op": "delete_entity", "name": "EntityName" }
- { "op": "rename_entity", "name": "OldName", "newName": "NewName" }
- { "op": "add_field", "entity": "EntityName", "name": "fieldName", "type": "uuid|string|text|integer|float|decimal|boolean|date|datetime|json", "nullable": true, "unique": false }
- { "op": "delete_field", "entity": "EntityName", "name": "fieldName" }
- { "op": "update_field", "entity": "EntityName", "name": "fieldName", "updates": { "type": "...", "nullable": true, "unique": false } }
- { "op": "add_relationship", "sourceName": "Entity", "targetName": "Entity", "type": "one-to-many|one-to-one|many-to-one|many-to-many" }
- { "op": "delete_relationship", "sourceName": "Entity", "targetName": "Entity" }
- { "op": "add_enum", "name": "EnumName", "values": ["VAL1", "VAL2"] }
- { "op": "delete_enum", "name": "EnumName" }
- { "op": "add_enum_value", "enumName": "EnumName", "value": "NEW_VALUE" }
- { "op": "rename_schema", "name": "NewSchemaName" }

══════════════════════════════════════════
GENERAL ASSISTANT RULES:

When the user asks a QUESTION (not a schema command):
- Answer fully and clearly with "patches": []
- Use examples, SQL snippets, comparisons when helpful
- Format the message nicely with line breaks

Topics you can help with:
• Database design (normalization, relationships, indexing, sharding)
• SQL queries (SELECT, JOIN, GROUP BY, window functions, CTEs)
• PostgreSQL / MySQL / SQLite / MongoDB specifics
• ORMs (Prisma, TypeORM, Sequelize, SQLAlchemy, Drizzle)
• Performance optimization (indexes, query plans, N+1, caching)
• Security (SQL injection, encryption, access control, RLS)
• API design (REST, GraphQL, pagination, filtering)
• Backend patterns (CQRS, event sourcing, soft delete, audit logs)
• Code examples in any language
• Debugging errors or explaining concepts
• Comparing technologies and recommending the best fit

LANGUAGE RULE:
- If user writes in Arabic → respond in Arabic
- If user writes in English → respond in English
- Always match the user's language exactly

OUTPUT: ONLY the JSON object. Nothing else.`;

function schemaToContext(schema: SchemaModel): string {
  const entities = schema.entities.map((e) => {
    const fields = e.fields.map((f) =>
      `    - ${f.name}: ${typeof f.type === 'object' ? 'enum' : f.type}${f.primaryKey ? ' [PK]' : ''}${f.unique ? ' [UNIQUE]' : ''}${f.nullable ? '' : ' [NOT NULL]'}`,
    ).join('\n');
    return `  ${e.name}${e.description ? ` (${e.description})` : ''}:\n${fields}`;
  }).join('\n');

  const relationships = schema.relationships.map((r) => {
    const src = schema.entities.find((e) => e.id === r.sourceEntityId)?.name ?? '?';
    const tgt = schema.entities.find((e) => e.id === r.targetEntityId)?.name ?? '?';
    return `  ${src} → ${tgt} (${r.type})`;
  }).join('\n');

  const enums = schema.enums.map((e) =>
    `  ${e.name}: [${e.values.join(', ')}]`,
  ).join('\n');

  return [
    `Schema: "${schema.name}"`,
    entities ? `Entities:\n${entities}` : 'No entities yet.',
    relationships ? `Relationships:\n${relationships}` : '',
    enums ? `Enums:\n${enums}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function sendChatMessage(
  userMessage: string,
  history: ChatMessage[],
  schema: SchemaModel,
): Promise<ChatResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  const model = getEffectiveModel();

  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Current schema context:\n${schemaToContext(schema)}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let response: globalThis.Response;

  if (!isDev) {
    // Production — route through Edge proxy (keeps key server-side)
    response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature:     0.2,
        max_tokens:      2048,
        response_format: { type: 'json_object' },
      }),
    });
  } else {
    // Development — call AI directly through Vite proxy
    const baseUrl = resolveProxyUrl(getEffectiveBaseUrl());
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream:          false,
        temperature:     0.2,
        max_tokens:      2048,
        response_format: { type: 'json_object' },
        messages,
      }),
    });
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = data.choices?.[0]?.message?.content ?? '{}';

  try {
    const fixed = jsonrepair(raw);
    const parsed = JSON.parse(fixed) as ChatResponse;
    return {
      message: parsed.message ?? '',
      patches: Array.isArray(parsed.patches) ? parsed.patches : [],
    };
  } catch {
    return { message: raw, patches: [] };
  }
}
