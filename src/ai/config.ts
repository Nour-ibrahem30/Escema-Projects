/**
 * AI Configuration
 *
 * All AI requests go through /api/ai-proxy — the API key lives on the
 * server (Vercel env vars) and is never exposed to the browser.
 *
 * The frontend only needs to know the available model names for the
 * model-switcher UI. These come from VITE_AI_MODEL* env vars (optional —
 * they fall back to sensible defaults if not set).
 */

// Models available for the user to pick from — shown in the chat UI.
// Must match what is configured server-side (AI_MODEL, AI_MODEL_FALLBACK_*).
export const AVAILABLE_MODELS: { id: string; label: string }[] = [
  { id: 'openai/gpt-oss-120b',   label: 'GPT OSS 120B  ⚡ أقوى' },
  { id: 'qwen/qwen3.6-27b',      label: 'Qwen 27B  ⚖ متوازن' },
  { id: 'openai/gpt-oss-20b',    label: 'GPT OSS 20B  🚀 سريع' },
  { id: 'llama-3.1-8b-instant',  label: 'Llama 8B  ⚡ أسرع' },
];

export const DEFAULT_MODEL_ID = AVAILABLE_MODELS[0]!.id;

/**
 * AI is always available — the proxy on the server handles everything.
 * No API key needed on the client side.
 */
export function isAIAvailable(): boolean {
  return true;
}
