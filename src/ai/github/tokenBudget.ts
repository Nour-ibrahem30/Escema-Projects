/**
 * Token Budget Manager
 * Estimates token usage and creates logical batches that stay within limits.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export const TOKEN_CONFIG = {
  /** Max input tokens per AI request (leave room for prompt overhead) */
  maxInputTokensPerRequest: 3500,
  /** Max output tokens — schema JSON */
  maxOutputTokens: 1500,
  /** Safety margin: use only this fraction of the limit */
  safetyMargin: 0.85,
  /** Prompt overhead (system prompt + instructions) in tokens */
  promptOverheadTokens: 400,
  /** Characters per token approximation */
  charsPerToken: 4,
};

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Rough token count: ~4 chars per token.
 * More accurate than nothing, and avoids calling a tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_CONFIG.charsPerToken);
}

export function effectiveBudget(): number {
  return Math.floor(
    (TOKEN_CONFIG.maxInputTokensPerRequest - TOKEN_CONFIG.promptOverheadTokens)
    * TOKEN_CONFIG.safetyMargin,
  );
}

// ─── File batch types ─────────────────────────────────────────────────────────

export type FileToBatch = {
  path: string;
  content: string;
  language: string;
  estimatedTokens: number;
};

export type Batch = {
  id: string;
  files: FileToBatch[];
  totalTokens: number;
};

// ─── Intelligent Batching ─────────────────────────────────────────────────────
// Groups files into batches that:
//   1. Don't exceed the token budget
//   2. Keep related files together (same directory / same concern)
//   3. Never slice a file in the middle

export function createBatches(
  files: { path: string; content: string; language: string }[],
): Batch[] {
  const budget = effectiveBudget();
  const batches: Batch[] = [];

  // Annotate with token estimates, truncate if a single file is too big
  const annotated: FileToBatch[] = files.map((f) => {
    let content = f.content;
    let tokens  = estimateTokens(content);

    // If a single file exceeds budget, truncate at a logical boundary
    if (tokens > budget) {
      content = truncateAtBoundary(content, budget * TOKEN_CONFIG.charsPerToken);
      tokens  = estimateTokens(content);
    }

    return { ...f, content, estimatedTokens: tokens };
  });

  // Group by directory prefix first (related files stay together)
  const grouped = groupByDirectory(annotated);

  let currentBatch: FileToBatch[] = [];
  let currentTokens = 0;
  let batchIdx = 0;

  const flush = () => {
    if (currentBatch.length === 0) return;
    batches.push({
      id: `batch-${++batchIdx}`,
      files: [...currentBatch],
      totalTokens: currentTokens,
    });
    currentBatch  = [];
    currentTokens = 0;
  };

  for (const file of grouped) {
    if (currentTokens + file.estimatedTokens > budget && currentBatch.length > 0) {
      flush();
    }
    currentBatch.push(file);
    currentTokens += file.estimatedTokens;
  }

  flush();

  return batches;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sort files so same-directory files are adjacent */
function groupByDirectory(files: FileToBatch[]): FileToBatch[] {
  return [...files].sort((a, b) => {
    const dirA = a.path.split('/').slice(0, -1).join('/');
    const dirB = b.path.split('/').slice(0, -1).join('/');
    if (dirA !== dirB) return dirA.localeCompare(dirB);
    return a.path.localeCompare(b.path);
  });
}

/** Truncate content at a logical boundary (newline) instead of mid-character */
function truncateAtBoundary(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Find the last newline before the limit
  const cut   = content.lastIndexOf('\n', maxChars);
  const index = cut > 0 ? cut : maxChars;
  return content.slice(0, index) + '\n// ... [truncated — file too large]';
}

/** Splits an oversized batch into two halves */
export function splitBatch(batch: Batch): [Batch, Batch] {
  const mid   = Math.ceil(batch.files.length / 2);
  const left  = batch.files.slice(0, mid);
  const right = batch.files.slice(mid);

  return [
    { id: `${batch.id}a`, files: left,  totalTokens: left.reduce((s, f)  => s + f.estimatedTokens, 0) },
    { id: `${batch.id}b`, files: right, totalTokens: right.reduce((s, f) => s + f.estimatedTokens, 0) },
  ];
}
