/**
 * AI Configuration — reads from environment variables.
 *
 * Model fallback chain (tried in order on rate-limit / error):
 *   VITE_AI_MODEL           → primary   (e.g. llama-3.3-70b-versatile)
 *   VITE_AI_MODEL_FALLBACK_1 → fallback 1 (e.g. llama-3.1-8b-instant)
 *   VITE_AI_MODEL_FALLBACK_2 → fallback 2 (e.g. groq/compound)
 *   VITE_AI_MODEL_FALLBACK_3 → fallback 3 (e.g. groq/compound-mini)
 *
 * Optional second provider:
 *   VITE_AI_FALLBACK_API_KEY
 *   VITE_AI_FALLBACK_BASE_URL
 */

export const AI_CONFIG = {
  apiKey:  import.meta.env.VITE_AI_API_KEY    as string | undefined,
  baseUrl: (import.meta.env.VITE_AI_BASE_URL  as string | undefined) ?? 'https://api.groq.com/openai/v1',

  // Model chain
  model:    (import.meta.env.VITE_AI_MODEL            as string | undefined) ?? 'llama-3.3-70b-versatile',
  fallback1: import.meta.env.VITE_AI_MODEL_FALLBACK_1  as string | undefined,
  fallback2: import.meta.env.VITE_AI_MODEL_FALLBACK_2  as string | undefined,
  fallback3: import.meta.env.VITE_AI_MODEL_FALLBACK_3  as string | undefined,

  // Optional second provider
  fallbackApiKey:  import.meta.env.VITE_AI_FALLBACK_API_KEY  as string | undefined,
  fallbackBaseUrl: import.meta.env.VITE_AI_FALLBACK_BASE_URL  as string | undefined,
};

// ─── Primary ──────────────────────────────────────────────────────────────────

export function getEffectiveApiKey(): string | null {
  return AI_CONFIG.apiKey?.trim() || null;
}

export function getEffectiveBaseUrl(): string {
  return AI_CONFIG.baseUrl;
}

export function getEffectiveModel(): string {
  return AI_CONFIG.model;
}

// ─── Model fallback chain ─────────────────────────────────────────────────────

/**
 * Returns all models in priority order.
 * The caller tries each model until one succeeds.
 */
export function getModelChain(): Array<{ apiKey: string; baseUrl: string; model: string }> {
  const primaryKey = AI_CONFIG.apiKey?.trim();
  if (!primaryKey) return [];

  const primaryUrl = AI_CONFIG.baseUrl;

  const chain: Array<{ apiKey: string; baseUrl: string; model: string }> = [
    { apiKey: primaryKey, baseUrl: primaryUrl, model: AI_CONFIG.model },
  ];

  // Fallback models on the same provider
  if (AI_CONFIG.fallback1?.trim()) {
    chain.push({ apiKey: primaryKey, baseUrl: primaryUrl, model: AI_CONFIG.fallback1.trim() });
  }
  if (AI_CONFIG.fallback2?.trim()) {
    chain.push({ apiKey: primaryKey, baseUrl: primaryUrl, model: AI_CONFIG.fallback2.trim() });
  }
  if (AI_CONFIG.fallback3?.trim()) {
    chain.push({ apiKey: primaryKey, baseUrl: primaryUrl, model: AI_CONFIG.fallback3.trim() });
  }

  // Optional second provider (different API key / base URL)
  const fbKey = AI_CONFIG.fallbackApiKey?.trim() || primaryKey;
  const fbUrl = AI_CONFIG.fallbackBaseUrl?.trim() || primaryUrl;
  if (AI_CONFIG.fallbackBaseUrl?.trim()) {
    chain.push({ apiKey: fbKey, baseUrl: fbUrl, model: AI_CONFIG.fallback1 ?? AI_CONFIG.model });
  }

  return chain;
}

/** Legacy — returns first fallback config or null */
export function getFallbackConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const chain = getModelChain();
  return chain[1] ?? null;
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
