/**
 * AI Configuration — reads from environment variables.
 *
 * IMPORTANT: The frontend uses /api/ai-proxy in production.
 * The actual API key is kept on the server (process.env.AI_API_KEY).
 *
 * Model fallback chain (tried in order on error/rate-limit):
 *   VITE_AI_MODEL           → primary   (e.g. openai/gpt-oss-120b)
 *   VITE_AI_MODEL_FALLBACK_1 → fallback 1 (e.g. qwen/qwen3.6-27b)
 *   VITE_AI_MODEL_FALLBACK_2 → fallback 2 (e.g. openai/gpt-oss-20b)
 *   VITE_AI_MODEL_FALLBACK_3 → fallback 3 (e.g. llama-3.1-8b-instant)
 *
 * Backend environment variables (Vercel Dashboard or .env in production):
 *   AI_API_KEY            = your Groq/OpenAI/etc key (SECRET — never expose to frontend)
 *   AI_BASE_URL           = https://api.groq.com/openai/v1
 *   AI_MODEL              = openai/gpt-oss-120b
 *   AI_MODEL_FALLBACK_1   = qwen/qwen3.6-27b
 *   AI_MODEL_FALLBACK_2   = openai/gpt-oss-20b
 *   AI_MODEL_FALLBACK_3   = llama-3.1-8b-instant
 */

export const AI_CONFIG = {
  // Frontend does NOT have direct access to the API key.
  // All requests are routed through /api/ai-proxy which handles authentication.
  baseUrl: (import.meta.env.VITE_AI_BASE_URL  as string | undefined) ?? '/api/ai-proxy',

  // Model chain — for informational purposes only.
  // The server (api/ai-proxy.ts) controls actual model selection.
  model:    (import.meta.env.VITE_AI_MODEL            as string | undefined) ?? 'openai/gpt-oss-120b',
  fallback1: (import.meta.env.VITE_AI_MODEL_FALLBACK_1  as string | undefined) ?? 'qwen/qwen3.6-27b',
  fallback2: (import.meta.env.VITE_AI_MODEL_FALLBACK_2  as string | undefined) ?? 'openai/gpt-oss-20b',
  fallback3: (import.meta.env.VITE_AI_MODEL_FALLBACK_3  as string | undefined) ?? 'llama-3.1-8b-instant',
};

// ─── Primary ──────────────────────────────────────────────────────────────────

// Frontend does NOT retrieve the API key directly.
// This function now only returns the base URL (which routes to /api/ai-proxy).
export function getEffectiveBaseUrl(): string {
  return AI_CONFIG.baseUrl;
}

export function getEffectiveModel(): string {
  return AI_CONFIG.model;
}

/** Check if AI is available (for UI enable/disable) */
export function isAIAvailable(): boolean {
  const isDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
     window.location.hostname === '127.0.0.1');

  if (!isDev) {
    // In production, /api/ai-proxy should always be available (requires server config)
    return true;
  }

  // In development, check if localStorage has an API key
  return Boolean(localStorage.getItem('ai_api_key'));
}

// ─── Model fallback chain ─────────────────────────────────────────────────────

/**
 * Returns all models in priority order (for reference/UI only).
 * The actual fallback is implemented server-side in api/ai-proxy.ts.
 */
export function getModelChain(): string[] {
  return [
    AI_CONFIG.model,
    AI_CONFIG.fallback1,
    AI_CONFIG.fallback2,
    AI_CONFIG.fallback3,
  ].filter((m): m is string => Boolean(m));
}

/** Returns true if the error indicates a rate-limit or quota issue */
export function isRateLimitError(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status === 403 && body.includes('blocked')) return true; // org-level block
  return (
    body.includes('rate_limit') ||
    body.includes('Rate limit') ||
    body.includes('quota') ||
    body.includes('TPD') ||
    body.includes('TPM') ||
    body.includes('tokens per')
  );
}

// ─── Proxy resolver ───────────────────────────────────────────────────────────

export function resolveProxyUrl(baseUrl: string): string {
  const isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  // In production → route through Vercel serverless function (keeps key server-side)
  if (!isDev) return '/api/ai-proxy';

  // In dev → use Vite proxy to avoid CORS
  if (baseUrl.includes('api.groq.com'))    return '/proxy/groq/openai/v1';
  if (baseUrl.includes('api.openai.com'))  return '/proxy/openai/v1';
  if (baseUrl.includes('openrouter.ai'))   return '/proxy/openrouter/api/v1';

  return baseUrl;
}
