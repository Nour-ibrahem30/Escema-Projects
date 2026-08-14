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
import {
  getModelChain, isRateLimitError, resolveProxyUrl,
} from '../config';
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

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 5000, 10000]; // exponential-ish

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Single AI call ───────────────────────────────────────────────────────────

async function callAI(
  prompt: string,
  modelIndex = 0,
): Promise<{ ok: boolean; status: number; body: string; modelUsed: string }> {
  const chain = getModelChain();
  const entry = chain[modelIndex] ?? chain[chain.length - 1]!;
  const { apiKey, baseUrl, model } = entry;

  const res = await fetch(`${resolveProxyUrl(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.1,
      max_tokens: TOKEN_CONFIG.maxOutputTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: BATCH_SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
    }),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body, modelUsed: model };
}

// ─── Parse AI response ────────────────────────────────────────────────────────

function parseResponse(body: string): AISchemaResponse | null {
  try {
    const data = JSON.parse(body) as { choices?: Array<{ message: { content: string } }> };
    const raw  = data.choices?.[0]?.message?.content ?? '{}';
    const fixed = jsonrepair(raw);
    const obj   = JSON.parse(fixed) as AISchemaResponse;
    if (!Array.isArray(obj.entities)) return null;
    return obj;
  } catch {
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
  const chain     = getModelChain();
  let retriesUsed = 0;
  let modelIndex  = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const modelName = chain[modelIndex]?.model ?? 'unknown';
      onProgress?.(`Analyzing batch ${batch.id} with ${modelName} (attempt ${attempt + 1})…`);

      const { ok, status, body } = await callAI(prompt, modelIndex);

      if (ok) {
        const schema = parseResponse(body);
        return { batchId: batch.id, status: schema ? 'success' : 'partial', schema, retriesUsed };
      }

      if (isRateLimitError(status, body)) {
        // Try next model in chain
        if (modelIndex < chain.length - 1) {
          modelIndex++;
          onProgress?.(`Rate limit on ${chain[modelIndex - 1]?.model} → trying ${chain[modelIndex]?.model}…`);
          attempt--; // don't count switching model as a retry
          continue;
        }

        // All models exhausted — wait and restart from model 0
        const delay = RETRY_DELAYS_MS[Math.min(retriesUsed, RETRY_DELAYS_MS.length - 1)];
        onProgress?.(`All models rate-limited — waiting ${delay / 1000}s…`);
        await sleep(delay);
        modelIndex = 0;
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
  }

  return results;
}
