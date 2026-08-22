import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { isAIAvailable } from './config';
import { parseAIError } from './errorHandler';
import { detectLang } from './i18n';
import { jsonrepair } from 'jsonrepair';
import type { SchemaModel } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AIField = {
  name: string;
  type: string;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
};

export type AIEntity = {
  name: string;
  description?: string;
  fields: AIField[];
};

export type AIRelationship = {
  sourceName: string;
  targetName: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  name?: string;
};

export type AIEnum = {
  name: string;
  values: string[];
};

export type AISchemaResponse = {
  schemaName: string;
  schemaDescription: string;
  entities: AIEntity[];
  relationships: AIRelationship[];
  enums: AIEnum[];
};

export type AIStreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: (result: AISchemaResponse) => void;
  onError: (error: string) => void;
};

// ─── Main generate function ───────────────────────────────────────────────────

export async function generateSchema(
  userMessage: string,
  currentSchema: SchemaModel,
  callbacks: AIStreamCallbacks,
): Promise<void> {
  if (!isAIAvailable()) {
    callbacks.onError('AI_NOT_CONFIGURED');
    return;
  }

  const lang = detectLang(userMessage);

  try {
    const { ok, data } = await aiRequest({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(userMessage, currentSchema) },
      ],
      temperature:     0.1,
      max_tokens:      32000, // Maximum flexibility for very large schemas (100+ entities)
      response_format: { type: 'json_object' },
      task_type:       'schema_generation',
      lang,
    });

    if (!ok) {
      const { message } = parseAIError(JSON.stringify(data), lang);
      callbacks.onError(message);
      return;
    }

    callbacks.onChunk(lang === 'en' ? 'Generating schema…' : 'جاري توليد الـ schema…');

    const content = (data as { choices?: Array<{ message: { content: string } }> })
      .choices?.[0]?.message?.content ?? '';

    const parsed = parseAIResponse(content);
    if (parsed) {
      callbacks.onDone(parsed);
    } else {
      callbacks.onError('Could not parse AI response as JSON. Raw:\n' + content);
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Makes an AI API call through /api/ai-proxy in both production and development.
 * The proxy handles model selection and fallback server-side.
 */
export async function aiRequest(payload: {
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  task_type?: string;
  lang?: 'ar' | 'en';
}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages:        payload.messages,
      temperature:     payload.temperature,
      max_tokens:      payload.max_tokens,
      response_format: payload.response_format,
      task_type:       payload.task_type,
      lang:            payload.lang,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
// Uses the `jsonrepair` library to fix common LLM JSON mistakes:
// missing quotes, missing colons, truncated output, trailing commas, etc.

function parseAIResponse(raw: string): AISchemaResponse | null {
  let text = raw.trim();

  // Strip <think>...</think> blocks (qwen and similar models)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // Extract outermost { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1) {
    text = end !== -1 ? text.slice(start, end + 1) : text.slice(start);
  }

  // First try: direct parse
  const direct = tryParse(text);
  if (direct) return direct;

  // Second try: jsonrepair fixes common LLM mistakes
  try {
    const fixed = jsonrepair(text);
    return tryParse(fixed);
  } catch {
    return null;
  }
}

function tryParse(text: string): AISchemaResponse | null {
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    const entities = obj['entities'];
    if (!Array.isArray(entities)) return null;

    return {
      schemaName: (obj['schemaName'] as string) ?? 'Generated Schema',
      schemaDescription: (obj['schemaDescription'] as string) ?? '',
      entities: entities as AIEntity[],
      relationships: (obj['relationships'] as AIRelationship[]) ?? [],
      enums: (obj['enums'] as AIEnum[]) ?? [],
    };
  } catch {
    return null;
  }
}
