/// <reference types="node" />
/**
 * Vercel Edge Function — AI Proxy
 *
 * Environment variables (Vercel Dashboard → Settings → Environment Variables):
 *   AI_API_KEY            = your Groq/OpenAI/etc key
 *   AI_BASE_URL           = https://api.groq.com/openai/v1
 *   AI_MODEL              = openai/gpt-oss-120b        ← powerful (schema gen)
 *   AI_MODEL_FALLBACK_1   = qwen/qwen3.6-27b           ← medium  (chat / analysis)
 *   AI_MODEL_FALLBACK_2   = openai/gpt-oss-20b         ← light   (simple tasks)
 *   AI_MODEL_FALLBACK_3   = llama-3.1-8b-instant       ← fastest (seed / query)
 *
 * Smart routing by task_type (sent from frontend):
 *   schema_generation → starts from strongest model
 *   analysis          → starts from medium model
 *   chat              → starts from medium model
 *   simple            → starts from lightest model
 *   (default)         → starts from strongest model
 *
 * Auto fallback: 429 / 403 / 404 → try next model in chain automatically.
 * Response includes _model_used so the UI can show which model answered.
 */

export const config = { runtime: 'edge' };

// ─── Allowed upstream providers (SSRF protection) ────────────────────────────

const ALLOWED_HOSTS = ['api.groq.com', 'api.openai.com', 'openrouter.ai'];

function isAllowed(url: string): boolean {
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// ─── Model chain builder ──────────────────────────────────────────────────────

type ModelEntry = { apiKey: string; baseUrl: string; model: string };

// ─── Rate-limit helpers ───────────────────────────────────────────────────────

/**
 * Extract a human-readable "retry after" string from Groq / OpenAI headers
 * and the response body error object.
 *
 * Groq returns:
 *   - Header: x-ratelimit-reset-requests   (ISO timestamp or epoch seconds)
 *   - Header: x-ratelimit-reset-tokens     (ISO timestamp or epoch seconds)
 *   - Header: retry-after                  (seconds as string)
 *   - Body:   error.message contains "try again in Xm Ys" or similar
 *
 * Returns seconds until retry, or null if unknown.
 */
function parseRetryAfterSeconds(
  headers: Headers,
  body: Record<string, unknown>,
): number | null {
  // 1. retry-after header (seconds)
  const retryAfterHeader = headers.get('retry-after');
  if (retryAfterHeader) {
    const secs = parseFloat(retryAfterHeader);
    if (!isNaN(secs) && secs > 0) return Math.ceil(secs);
  }

  // 2. x-ratelimit-reset-requests or x-ratelimit-reset-tokens (ISO or epoch)
  for (const h of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) {
    const val = headers.get(h);
    if (!val) continue;

    // ISO timestamp e.g. "2024-01-15T10:30:00Z"
    if (val.includes('T') || val.includes('-')) {
      const resetMs = new Date(val).getTime();
      if (!isNaN(resetMs)) {
        const diffSecs = Math.ceil((resetMs - Date.now()) / 1000);
        if (diffSecs > 0) return diffSecs;
      }
    }

    // Epoch seconds or milliseconds
    const num = parseFloat(val);
    if (!isNaN(num)) {
      // If the number is very large it's probably ms since epoch
      const ms = num > 1e12 ? num : num * 1000;
      const diffSecs = Math.ceil((ms - Date.now()) / 1000);
      if (diffSecs > 0 && diffSecs < 86_400) return diffSecs;
    }
  }

  // 3. Parse body error message — e.g. "Rate limit reached... try again in 1m30s"
  const errMsg: string =
    (body?.error as { message?: string } | undefined)?.message ?? '';
  if (errMsg) {
    // Pattern: "try again in 1m30s" or "try again in 30s" or "try again in 2m"
    const match = errMsg.match(/try again in\s+(?:(\d+)m\s*)?(?:(\d+(?:\.\d+)?)s)?/i);
    if (match) {
      const mins = parseInt(match[1] ?? '0', 10);
      const secs = parseFloat(match[2] ?? '0');
      const total = mins * 60 + secs;
      if (total > 0) return Math.ceil(total);
    }

    // Pattern: "please wait X seconds"
    const waitMatch = errMsg.match(/wait\s+(\d+)\s+second/i);
    if (waitMatch) return parseInt(waitMatch[1], 10);
  }

  return null;
}

/**
 * Classify why the request failed and build a user-friendly message.
 * Language is determined by the `lang` field sent by the frontend.
 * Also returns `retry_after_secs` so the frontend can show a live countdown.
 */
function buildErrorPayload(
  status: number,
  headers: Headers,
  body: Record<string, unknown>,
  lang: 'ar' | 'en' = 'ar',
): { error: string; error_code: string; retry_after_secs: number | null } {
  const retryAfterSecs = parseRetryAfterSeconds(headers, body);
  const retryMsg = retryAfterSecs !== null ? formatRetryTime(retryAfterSecs, lang) : null;

  if (status === 429) {
    const errMsg = (body?.error as { message?: string } | undefined)?.message ?? '';
    const isDaily = /daily|day|quota|TPD/i.test(errMsg);

    if (isDaily) {
      return {
        error: lang === 'en'
          ? (retryMsg ? `Daily usage limit reached. Try again in ${retryMsg}.` : 'Daily usage limit reached. Try tomorrow.')
          : (retryMsg ? `وصلت للحد اليومي للاستخدام. جرب بعد ${retryMsg}.` : 'وصلت للحد اليومي للاستخدام. جرب غداً.'),
        error_code: 'DAILY_LIMIT',
        retry_after_secs: retryAfterSecs,
      };
    }
    return {
      error: lang === 'en'
        ? (retryMsg ? `Service is busy (rate limit). Try again in ${retryMsg}.` : 'Service is busy. Try again in a minute.')
        : (retryMsg ? `الخدمة مشغولة الآن (rate limit). جرب بعد ${retryMsg}.` : 'الخدمة مشغولة الآن. جرب بعد دقيقة.'),
      error_code: 'RATE_LIMIT',
      retry_after_secs: retryAfterSecs,
    };
  }

  if (status === 403) {
    return {
      error: lang === 'en'
        ? 'Usage quota exceeded. It will reset soon.'
        : 'تم تجاوز الحصة المسموح بها. سيتم التجديد قريباً.',
      error_code: 'QUOTA_EXCEEDED',
      retry_after_secs: retryAfterSecs,
    };
  }

  if (status === 503 || status === 502) {
    return {
      error: lang === 'en'
        ? 'Service temporarily unavailable. Try again in a few minutes.'
        : 'الخدمة غير متاحة مؤقتاً. جرب بعد دقائق.',
      error_code: 'SERVICE_DOWN',
      retry_after_secs: retryAfterSecs ?? 60,
    };
  }

  if (status === 500) {
    return {
      error: lang === 'en' ? 'Server error. Please try again.' : 'حدث خطأ في الخادم. جرب مرة أخرى.',
      error_code: 'SERVER_ERROR',
      retry_after_secs: null,
    };
  }

  return {
    error: lang === 'en' ? 'An unexpected error occurred. Please try again.' : 'حدث خطأ غير متوقع. جرب مرة أخرى.',
    error_code: 'UNKNOWN',
    retry_after_secs: null,
  };
}

/** Format seconds into a human-readable string in the given language */
function formatRetryTime(secs: number, lang: 'ar' | 'en' = 'ar'): string {
  const s = Math.ceil(secs);
  if (lang === 'en') {
    if (s < 60)   return `${s} second${s === 1 ? '' : 's'}`;
    if (s < 3600) {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return rem > 0 ? `${m} min ${rem}s` : `${m} minute${m === 1 ? '' : 's'}`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h} hour${h === 1 ? '' : 's'}`;
  }
  // Arabic
  if (s < 60)   return `${s} ثانية`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m} دقيقة و${rem} ثانية` : `${m} دقيقة`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`;
}

function getAllModels(): ModelEntry[] {
  const apiKey  = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim() || 'https://api.groq.com/openai/v1';

  if (!apiKey) return [];

  return [
    process.env.AI_MODEL,
    process.env.AI_MODEL_FALLBACK_1,
    process.env.AI_MODEL_FALLBACK_2,
    process.env.AI_MODEL_FALLBACK_3,
  ]
    .map((m) => m?.trim())
    .filter((m): m is string => Boolean(m))
    .map((model) => ({ apiKey, baseUrl, model }));
}

/**
 * Order models by task type — returns the full chain starting from the
 * best model for that task. Remaining models act as automatic fallbacks.
 */
function getChainForTask(
  allModels: ModelEntry[],
  taskType: string,
  preferredModel?: string,
): ModelEntry[] {
  if (allModels.length === 0) return [];

  // If the user explicitly chose a model, put it first then fall back to others
  if (preferredModel) {
    const chosen = allModels.find((m) => m.model === preferredModel);
    if (chosen) {
      return [chosen, ...allModels.filter((m) => m.model !== preferredModel)];
    }
  }

  // Smart routing: rotate start index based on task
  // 0 = strongest, 1 = medium, 2 = light, 3 = fastest
  const startIndex: Record<string, number> = {
    schema_generation: 0,
    analysis:          1,
    chat:              1,
    simple:            Math.max(0, allModels.length - 1),
  };

  const idx = startIndex[taskType] ?? 0;
  const clamped = Math.min(idx, allModels.length - 1);

  // Rotate: [idx, idx+1, ..., 0, 1, ..., idx-1]
  return [
    ...allModels.slice(clamped),
    ...allModels.slice(0, clamped),
  ];
}

// Models that do NOT support response_format: { type: 'json_object' }
// For these we rely on prompt engineering + jsonrepair on the client side
const NO_JSON_MODE = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  'groq/compound',
  'groq/compound-mini',
  'canopylabs/orpheus-arabic-saudi',
  'canopylabs/orpheus-v1-english',
  'meta-llama/llama-prompt-guard-2-22m',
  'meta-llama/llama-prompt-guard-2-86m',
]);

// ─── Allowed origins (CORS) ───────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  'https://escema-projects.vercel.app',
  // Allow all *.vercel.app preview deployments for this project
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow Vercel preview deployments: escema-projects-*.vercel.app
  if (/^https:\/\/escema-projects-[^.]+\.vercel\.app$/.test(origin)) return true;
  // Allow localhost in development
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Only reflect the origin if it's in the allowlist
  const allowedOrigin = isAllowedOrigin(origin) ? origin! : 'https://escema-projects.vercel.app';
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors   = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const allModels = getAllModels();
  if (allModels.length === 0) {
    return new Response(
      JSON.stringify({ error: 'AI service is not configured. Please contact the administrator.' }),
      { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  // Parse request body
  let body: {
    messages?:        unknown[];
    temperature?:     number;
    max_tokens?:      number;
    response_format?: unknown;
    task_type?:       string;
    preferred_model?: string;
    /** Language of the user's last message — 'ar' | 'en'. Defaults to 'ar'. */
    lang?:            'ar' | 'en';
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request format.' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const lang  = body.lang ?? 'ar';
  const chain = getChainForTask(
    allModels,
    body.task_type   ?? 'default',
    body.preferred_model,
  );

  // Try each model in chain
  for (let i = 0; i < chain.length; i++) {
    const { apiKey, baseUrl, model } = chain[i]!;

    if (!isAllowed(baseUrl)) continue;

    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages:        body.messages,
          temperature:     body.temperature     ?? 0.1,
          max_tokens:      body.max_tokens      ?? 4096,
          // Only pass response_format if the model supports json_object mode
          response_format: body.response_format && !NO_JSON_MODE.has(model)
            ? body.response_format
            : undefined,
          stream:          false,
        }),
      });

      const data = await upstream.json() as Record<string, unknown>;

      // Rate limit / quota / model not found / bad request for this model → try next
      if (
        (upstream.status === 429 ||
         upstream.status === 403 ||
         upstream.status === 404 ||
         upstream.status === 400) &&
        i < chain.length - 1
      ) {
        continue;
      }

      // All models exhausted or non-retryable error — build detailed error payload
      if (!upstream.ok) {
        const errPayload = buildErrorPayload(upstream.status, upstream.headers, data, lang);
        return new Response(
          JSON.stringify(errPayload),
          { status: upstream.status, headers: { ...cors, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ ...data, _model_used: model }),
        {
          status:  upstream.status,
          headers: { ...cors, 'Content-Type': 'application/json' },
        },
      );

    } catch {
      if (i === chain.length - 1) {
        return new Response(
          JSON.stringify({
            error: lang === 'en'
              ? 'Connection error. Check your internet and try again.'
              : 'حدث خطأ في الاتصال بالخدمة. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
            error_code: 'NETWORK_ERROR',
            retry_after_secs: null,
          }),
          { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
        );
      }
      // Network error on this model → try next
    }
  }

  return new Response(
    JSON.stringify({
      error: lang === 'en'
        ? 'All AI services are currently unavailable. Try again in a few minutes.'
        : 'جميع خدمات الذكاء الاصطناعي غير متاحة حالياً. جرب بعد دقائق.',
      error_code: 'ALL_MODELS_DOWN',
      retry_after_secs: 300,
    }),
    { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
}
