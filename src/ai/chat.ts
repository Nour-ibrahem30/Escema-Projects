/**
 * AI Chat — edits the existing schema via natural language patch operations.
 * All requests go through /api/ai-proxy (server handles model selection + fallback).
 */
import { jsonrepair } from 'jsonrepair';
import { parseAIError } from './errorHandler';
import { detectLang, type Lang } from './i18n';
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
  /** Model that actually answered — returned by /api/ai-proxy as _model_used */
  modelUsed?: string;
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
RELATIONSHIP RULES — ALWAYS FOLLOW:

When adding entities, you MUST also add all logical relationships between them.
NEVER add entities without adding their relationships in the same response.

Examples:
- User has many Orders → add_relationship: User → Order (one-to-many)
- Order belongs to User → add_relationship: Order → User (many-to-one)  
- User has one Profile → add_relationship: User → Profile (one-to-one)
- Student takes many Courses → add_relationship: Student → Course (many-to-many)

FK FIELD RULES:
- For one-to-many: add a UUID FK field on the "many" side (e.g. Order gets "userId" field)
- For many-to-many: use add_relationship with type "many-to-many" (junction table is auto-created)
- For one-to-one: add FK on the dependent entity

ALWAYS include relationships when:
1. Adding multiple entities that are logically related
2. The user describes a domain (hotel, school, e-commerce, etc.)
3. Modifying existing schema to add features

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

LANGUAGE RULE:
- If user writes in Arabic → respond in Arabic
- If user writes in English → respond in English
- Always match the user's language exactly

OUTPUT: ONLY the JSON object. Nothing else.`;

/**
 * Extracts a JSON object from model output.
 * Caller should already have stripped <think> blocks.
 * Handles markdown fences and prose wrapping.
 */
function extractJSON(text: string): string {
  let t = text.trim();
  // Strip markdown code fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // Find outermost { ... }
  const start = t.indexOf('{');
  const end   = t.lastIndexOf('}');
  if (start !== -1 && end > start) return t.slice(start, end + 1);
  return t;
}

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
  preferredModel?: string,
): Promise<ChatResponse> {
  const lang: Lang = detectLang(userMessage);

  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Current schema context:\n${schemaToContext(schema)}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  // Estimate total input tokens (~4 chars per token) to decide output budget
  const inputChars  = messages.reduce((sum, m) => sum + m.content.length, 0);
  const inputTokens = Math.ceil(inputChars / 4);

  // For large requests (complex schema operations), use more output tokens
  // and route to the strongest model via task_type
  const isLargeRequest = inputTokens > 2000 || userMessage.length > 800;
  const maxTokens  = isLargeRequest ? 8192 : 2048;
  const taskType   = isLargeRequest ? 'schema_generation' : 'chat';

  // Abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

  try {
    const response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature:      0.2,
        max_tokens:       maxTokens,
        response_format:  { type: 'json_object' },
        task_type:        taskType,
        preferred_model:  preferredModel,
        lang,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const { message } = parseAIError(errText, lang);
      throw new Error(message);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      _model_used?: string;
    };

    // Validate response structure
    if (!data.choices || data.choices.length === 0 || !data.choices[0]?.message?.content) {
      throw new Error(
        lang === 'en' 
          ? 'Invalid response from AI service. Please try again.'
          : 'رد غير صالح من خدمة الذكاء الاصطناعي. حاول مرة أخرى.'
      );
    }

    const raw       = data.choices[0].message.content;
    const modelUsed = data._model_used;

    // Strip <think> blocks first — preserve the rest for fallback display
    const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Try to extract and parse the JSON object
    const extracted = extractJSON(withoutThink);

    try {
      const fixed  = jsonrepair(extracted);
      const parsed = JSON.parse(fixed) as ChatResponse;
      return {
        // Use parsed.message if available, otherwise show the non-think content
        message:   parsed.message?.trim() || withoutThink || raw,
        patches:   Array.isArray(parsed.patches) ? parsed.patches : [],
        modelUsed,
      };
    } catch {
      // JSON parse failed — return whatever text the model produced (minus think blocks)
      return { message: withoutThink || raw, patches: [], modelUsed };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        lang === 'en'
          ? 'Request timed out. The request is too large. Try using the AI bar below the canvas for large schema generation.'
          : 'انتهت مهلة الطلب. الطلب كبير جداً. استخدم شريط الـ AI أسفل الـ canvas لتوليد schema كبير.'
      );
    }
    throw err;
  }
}
