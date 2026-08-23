/**
 * Batch Analyzer
 * Sends one batch at a time to the AI API with:
 *   - Token-aware requests
 *   - Exponential-backoff retry on 429/413/timeout
 *   - Automatic batch splitting if response is still too large
 *   - Concurrency queue (MAX_CONCURRENT = 1 by default)
 *   - Graceful partial failure (one bad batch doesn't stop others)
 */
import { jsonrepair } from 'jsonrepair';
import { aiRequest } from '../engine';
import type { AISchemaResponse } from '../engine';
import { TOKEN_CONFIG, splitBatch, type Batch } from './tokenBudget';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BatchResult = {
  batchId: string;
  status: 'success' | 'partial' | 'failed';
  schema: AISchemaResponse | null;
  error?: string;
  retriesUsed: number;
};

export type BatchProgressCallback = (
  batchId: string,
  completed: number,
  total: number,
  status: string,
) => void;

// ─── Prompt builder ───────────────────────────────────────────────────────────

const BATCH_SYSTEM_PROMPT = `You are a database schema expert. Extract database entities and relationships from the provided code files.

Return ONLY a JSON object:
{
  "schemaName": "string",
  "schemaDescription": "string",
  "entities": [
    {
      "name": "PascalCase",
      "description": "string",
      "fields": [
        { "name": "camelCase", "type": "uuid|string|text|integer|float|decimal|boolean|date|datetime|json", "primaryKey": boolean, "nullable": boolean, "unique": boolean }
      ]
    }
  ],
  "relationships": [
    { "sourceName": "A", "targetName": "B", "type": "one-to-many|one-to-one|many-to-one|many-to-many" }
  ],
  "enums": [{ "name": "Name", "values": ["VALUE"] }]
}

Rules:
- Only include entities you can actually see in the code
- Every entity must have an id field (uuid, primaryKey: true)
- If no entities found, return { "entities": [], "relationships": [], "enums": [] }
- No explanations, no markdown, ONLY the JSON`;

function buildBatchPrompt(batch: Batch, projectName: string): string {
  const fileBlocks = batch.files
    .map((f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join('\n\n');

  return `Project: ${projectName}
Files in this batch (${batch.files.length} files, ~${batch.totalTokens} tokens):

${fileBlocks}

Extract all database entities, models, and their relationships from the code above.`;
}

// ─── Retry config ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [3000, 8000, 15000, 30000]; // exponential backoff

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Single AI call ───────────────────────────────────────────────────────────

async function callAI(
  prompt: string,
): Promise<{ ok: boolean; status: number; body: string; modelUsed: string }> {
  const { ok, status, data } = await aiRequest({
    messages: [
      { role: 'system', content: BATCH_SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature:     0.1,
    max_tokens:      TOKEN_CONFIG.maxOutputTokens,
    response_format: { type: 'json_object' },
    task_type:       'schema_generation', // Use the strongest model
  });

  return {
    ok,
    status,
    body:      JSON.stringify(data),
    modelUsed: (data as { _model_used?: string })._model_used ?? 'backend-selected',
  };
}

// ─── Parse AI response ────────────────────────────────────────────────────────

function extractContent(raw: string): string {
  let text = raw.trim();
  // Strip <think>...</think> blocks (qwen, gpt-oss models)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // Extract outermost { ... }
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

function parseResponse(body: string): AISchemaResponse | null {
  try {
    const data = JSON.parse(body) as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message: string };
      _model_used?: string;
    };

    // Check for error response
    if (data.error) {
      console.warn('[BatchAnalyzer] AI error:', data.error.message);
      return null;
    }

    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw) return null;

    const extracted = extractContent(raw);
    const fixed     = jsonrepair(extracted);
    const obj       = JSON.parse(fixed) as AISchemaResponse;
    if (!Array.isArray(obj.entities)) return null;
    return obj;
  } catch (e) {
    console.warn('[BatchAnalyzer] Parse error:', e);
    return null;
  }
}

// ─── Analyze a single batch with retry ───────────────────────────────────────

export async function analyzeBatch(
  batch: Batch,
  projectName: string,
  onProgress?: (msg: string) => void,
): Promise<BatchResult> {
  const prompt    = buildBatchPrompt(batch, projectName);
  let retriesUsed = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      onProgress?.(`Analyzing batch ${batch.id} (attempt ${attempt + 1})…`);

      const { ok, status, body } = await callAI(prompt);

      if (ok) {
        const schema = parseResponse(body);
        if (schema) {
          return { batchId: batch.id, status: 'success', schema, retriesUsed };
        }
        // AI responded but JSON was unparseable — log and try next attempt
        console.warn('[BatchAnalyzer] Could not parse response for batch', batch.id, body.slice(0, 300));
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
          retriesUsed++;
          continue;
        }
        return { batchId: batch.id, status: 'failed', schema: null, error: 'Could not parse AI response as JSON', retriesUsed };
      }

      // 429 = rate limit, 403 = quota exceeded
      if (status === 429 || (status === 403 && body.includes('blocked'))) {
        // Rate limited — wait and retry
        const delay = RETRY_DELAYS_MS[Math.min(retriesUsed, RETRY_DELAYS_MS.length - 1)];
        onProgress?.(`Rate limited — waiting ${delay / 1000}s…`);
        await sleep(delay);
        retriesUsed++;
        continue;
      }

      if (status === 413) {
        return { batchId: batch.id, status: 'failed', schema: null, error: 'BATCH_TOO_LARGE', retriesUsed };
      }

      return {
        batchId: batch.id, status: 'failed', schema: null,
        error: `HTTP ${status}: ${body.slice(0, 200)}`, retriesUsed,
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_RETRIES) {
        return { batchId: batch.id, status: 'failed', schema: null, error: msg, retriesUsed };
      }
      await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
      retriesUsed++;
    }
  }

  return { batchId: batch.id, status: 'failed', schema: null, error: 'Max retries exceeded', retriesUsed };
}

// ─── Process all batches sequentially (concurrency = 1) ──────────────────────

export async function analyzeAllBatches(
  batches: Batch[],
  projectName: string,
  onProgress: BatchProgressCallback,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  const queue = [...batches];
  let completed = 0;

  while (queue.length > 0) {
    const batch = queue.shift()!;

    const result = await analyzeBatch(
      batch,
      projectName,
      (msg) => onProgress(batch.id, completed, batches.length, msg),
    );

    // If batch was too large, split and re-queue
    if (result.error === 'BATCH_TOO_LARGE' && batch.files.length > 1) {
      const [a, b] = splitBatch(batch);
      queue.unshift(b, a); // process first half first
      continue;
    }

    results.push(result);
    completed++;
    onProgress(batch.id, completed, batches.length, result.status);

    // Small delay between batches to avoid rate limiting
    if (queue.length > 0) await sleep(1500);
  }

  return results;
}
