import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import {
  getEffectiveApiKey, getEffectiveBaseUrl, getEffectiveModel,
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

  const baseUrl = resolveProxyUrl(getEffectiveBaseUrl());
  const model   = getEffectiveModel();
  let fullText = '';
  void fullText;

  // Try each model in the chain on rate-limit errors
  const chain = getModelChain();
  let lastError = '';

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;
    try {
      const response = await fetch(`${resolveProxyUrl(entry.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${entry.apiKey}`,
        },
        body: JSON.stringify({
          model: entry.model,
          stream: false,
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: buildUserPrompt(userMessage, currentSchema) },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        if (isRateLimitError(response.status, err) && i < chain.length - 1) {
          // Try next model
          callbacks.onChunk(`Rate limit on ${entry.model} → trying ${chain[i + 1]!.model}…`);
          continue;
        }
        callbacks.onError(`API error ${response.status}: ${err}`);
        return;
      }

      callbacks.onChunk('Generating schema…');

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';

      const parsed = parseAIResponse(content);
      if (parsed) {
        callbacks.onDone(parsed);
      } else {
        callbacks.onError('Could not parse AI response as JSON. Raw:\n' + content);
      }
      return; // success — stop chain

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (i === chain.length - 1) {
        callbacks.onError(lastError);
      }
    }
  }
}

// ─── JSON repair + parser ─────────────────────────────────────────────────────
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
