import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import {
  getEffectiveApiKey,
  getModelChain, isRateLimitError, resolveProxyUrl,
} from './config';
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
  const apiKey = getEffectiveApiKey();
  if (!apiKey) {
    callbacks.onError('NO_API_KEY');
    return;
  }

  // Try each model in the chain on rate-limit errors
  const chain = getModelChain();
  let lastError = '';

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;
    try {
      const { ok, status, data } = await aiRequest({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildUserPrompt(userMessage, currentSchema) },
        ],
        temperature:     0.1,
        max_tokens:      4096,
        response_format: { type: 'json_object' },
        modelIndex:      i,
      });

      const bodyStr = JSON.stringify(data);

      if (!ok) {
        if (isRateLimitError(status, bodyStr) && i < chain.length - 1) {
          callbacks.onChunk(`Rate limit on ${entry.model} → trying ${chain[i + 1]!.model}…`);
          continue;
        }
        callbacks.onError(`API error ${status}: ${bodyStr}`);
        return;
      }

      callbacks.onChunk('Generating schema…');

      const content = (data as { choices?: Array<{ message: { content: string } }> })
        .choices?.[0]?.message?.content ?? '';

      const parsed = parseAIResponse(content);
      if (parsed) {
        callbacks.onDone(parsed);
      } else {
        callbacks.onError('Could not parse AI response as JSON. Raw:\n' + content);
      }
      return;

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (i === chain.length - 1) callbacks.onError(lastError);
    }
  }
}

/**
 * Makes an AI API call — routes through /api/ai-proxy in production,
 * through Vite dev proxy in development.
 */
export async function aiRequest(payload: {
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  modelIndex?: number;
}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!isDev) {
    // Production: send to Vercel serverless proxy
    const res = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:        payload.messages,
        temperature:     payload.temperature,
        max_tokens:      payload.max_tokens,
        response_format: payload.response_format,
      }),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  // Development: call AI directly through Vite proxy
  const chain  = getModelChain();
  const index  = Math.min(payload.modelIndex ?? 0, chain.length - 1);
  const entry  = chain[index]!;
  const url    = `${resolveProxyUrl(entry.baseUrl)}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${entry.apiKey}`,
    },
    body: JSON.stringify({
      model:           entry.model,
      messages:        payload.messages,
      temperature:     payload.temperature ?? 0.1,
      max_tokens:      payload.max_tokens  ?? 4096,
      response_format: payload.response_format,
      stream:          false,
    }),
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
// Uses the `jsonrepair` library to fix common LLM JSON mistakes:
// missing quotes, missing colons, truncated output, trailing commas, etc.

function parseAIResponse(raw: string): AISchemaResponse | null {
  let text = raw.trim();

  // Strip markdown fences if model added them
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

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
