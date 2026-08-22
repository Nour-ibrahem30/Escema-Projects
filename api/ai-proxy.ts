/**
 * Vercel Serverless Function (Node.js) — AI Proxy
 * Runs on Node.js runtime for 50MB body size limit (vs 4MB for Edge).
 * This allows large schema contexts + chat history to be sent without 413 errors.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelEntry = { apiKey: string; baseUrl: string; model: string };

type RequestBody = {
  messages?:        unknown[];
  temperature?:     number;
  max_tokens?:      number;
  response_format?: unknown;
  task_type?:       string;
  preferred_model?: string;
  lang?:            'ar' | 'en';
};

// ─── SSRF protection ─────────────────────────────────────────────────────────

const ALLOWED_HOSTS = ['api.groq.com', 'api.openai.com', 'openrouter.ai'];

function isAllowed(url: string): boolean {
  try { return ALLOWED_HOSTS.includes(new URL(url).hostname); }
  catch { return false; }
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set(['https://escema-projects.vercel.app']);

function getAllowedOrigin(origin: string | undefined): string {
  if (!origin) return 'https://escema-projects.vercel.app';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https:\/\/escema-projects-[^.]+\.vercel\.app$/.test(origin)) return origin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return 'https://escema-projects.vercel.app';
}

function setCors(req: VercelRequest, res: VercelResponse): void {
  const origin = getAllowedOrigin(req.headers.origin as string | undefined);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

// ─── Models ───────────────────────────────────────────────────────────────────

// Models that don't support response_format: json_object
const NO_JSON_MODE = new Set([
  'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b',
  'groq/compound', 'groq/compound-mini',
  'canopylabs/orpheus-arabic-saudi', 'canopylabs/orpheus-v1-english',
  'meta-llama/llama-prompt-guard-2-22m', 'meta-llama/llama-prompt-guard-2-86m',
]);

function getAllModels(): ModelEntry[] {
  const apiKey  = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim() || 'https://api.groq.com/openai/v1';
  if (!apiKey) return [];
  return [
    process.env.AI_MODEL,
    process.env.AI_MODEL_FALLBACK_1,
    process.env.AI_MODEL_FALLBACK_2,
    process.env.AI_MODEL_FALLBACK_3,
  ].map((m) => m?.trim()).filter((m): m is string => Boolean(m))
   .map((model) => ({ apiKey, baseUrl, model }));
}

function getChain(allModels: ModelEntry[], taskType: string, preferred?: string): ModelEntry[] {
  if (allModels.length === 0) return [];
  if (preferred) {
    const chosen = allModels.find((m) => m.model === preferred);
    if (chosen) return [chosen, ...allModels.filter((m) => m.model !== preferred)];
  }
  const startIndex: Record<string, number> = {
    schema_generation: 0, analysis: 1, chat: 1,
    simple: Math.max(0, allModels.length - 1),
  };
  const idx     = Math.min(startIndex[taskType] ?? 0, allModels.length - 1);
  return [...allModels.slice(idx), ...allModels.slice(0, idx)];
}

// ─── Error helpers ────────────────────────────────────────────────────────────

function parseRetryAfter(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): number | null {
  const ra = headers['retry-after'];
  if (ra) { const s = parseFloat(String(ra)); if (!isNaN(s) && s > 0) return Math.ceil(s); }
  const errMsg = (body?.error as { message?: string } | undefined)?.message ?? '';
  const m = errMsg.match(/try again in\s+(?:(\d+)m\s*)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (m) { const total = parseInt(m[1] ?? '0') * 60 + parseFloat(m[2] ?? '0'); if (total > 0) return Math.ceil(total); }
  return null;
}

function fmtRetry(secs: number, lang: 'ar' | 'en'): string {
  const s = Math.ceil(secs);
  if (lang === 'en') {
    if (s < 60) return `${s}s`;
    if (s < 3600) { const m = Math.floor(s / 60); return `${m}m`; }
    return `${Math.floor(s / 3600)}h`;
  }
  if (s < 60) return `${s} ثانية`;
  if (s < 3600) return `${Math.floor(s / 60)} دقيقة`;
  return `${Math.floor(s / 3600)} ساعة`;
}

function buildError(status: number, hdrs: Record<string, string | string[] | undefined>, body: Record<string, unknown>, lang: 'ar' | 'en') {
  const raSecs = parseRetryAfter(hdrs, body);
  const raStr  = raSecs ? fmtRetry(raSecs, lang) : null;
  const ar = lang === 'ar';

  if (status === 429) {
    const isDaily = /daily|quota|TPD/i.test((body?.error as { message?: string })?.message ?? '');
    return { error: ar
      ? (raStr ? `وصلت للحد اليومي. جرب بعد ${raStr}.` : 'وصلت للحد اليومي. جرب لاحقاً.')
      : (raStr ? `Rate limited. Try again in ${raStr}.` : 'Rate limited. Try in a minute.'),
      error_code: isDaily ? 'DAILY_LIMIT' : 'RATE_LIMIT', retry_after_secs: raSecs };
  }
  if (status === 403) return { error: ar ? 'تم تجاوز الحصة.' : 'Quota exceeded.', error_code: 'QUOTA_EXCEEDED', retry_after_secs: raSecs };
  if (status >= 502 && status <= 503) return { error: ar ? 'الخدمة غير متاحة مؤقتاً.' : 'Service unavailable.', error_code: 'SERVICE_DOWN', retry_after_secs: raSecs ?? 60 };
  if (status === 500) return { error: ar ? 'خطأ في الخادم.' : 'Server error.', error_code: 'SERVER_ERROR', retry_after_secs: null };
  return { error: ar ? 'حدث خطأ غير متوقع. جرب مرة أخرى.' : 'An unexpected error occurred. Please try again.', error_code: 'UNKNOWN', retry_after_secs: null };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  const allModels = getAllModels();
  if (allModels.length === 0) {
    res.status(503).json({ error: 'AI service is not configured. Please contact the administrator.' });
    return;
  }

  const body = req.body as RequestBody;

  if (!body?.messages || !Array.isArray(body.messages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  const lang  = body.lang ?? 'ar';
  const chain = getChain(allModels, body.task_type ?? 'default', body.preferred_model);

  for (let i = 0; i < chain.length; i++) {
    const { apiKey, baseUrl, model } = chain[i]!;
    if (!isAllowed(baseUrl)) continue;

    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages:        body.messages,
          temperature:     body.temperature  ?? 0.1,
          max_tokens:      body.max_tokens   ?? 4096,
          response_format: body.response_format && !NO_JSON_MODE.has(model) ? body.response_format : undefined,
          stream:          false,
        }),
      });

      const data = await upstream.json() as Record<string, unknown>;

      // Retryable errors — try next model
      if ([429, 403, 404, 400].includes(upstream.status) && i < chain.length - 1) continue;

      if (!upstream.ok) {
        const hdrs = Object.fromEntries(upstream.headers.entries()) as Record<string, string>;
        const errPayload = buildError(upstream.status, hdrs, data, lang);
        res.status(upstream.status).json(errPayload);
        return;
      }

      res.status(200).json({ ...data, _model_used: model });
      return;

    } catch {
      if (i === chain.length - 1) {
        res.status(500).json({
          error: lang === 'ar' ? 'حدث خطأ في الاتصال. تحقق من الإنترنت وحاول مرة أخرى.' : 'Connection error. Please try again.',
          error_code: 'NETWORK_ERROR',
          retry_after_secs: null,
        });
        return;
      }
    }
  }

  res.status(503).json({
    error: lang === 'ar' ? 'جميع خدمات الذكاء الاصطناعي غير متاحة. جرب بعد دقائق.' : 'All AI services unavailable. Try again in a few minutes.',
    error_code: 'ALL_MODELS_DOWN',
    retry_after_secs: 300,
  });
}
