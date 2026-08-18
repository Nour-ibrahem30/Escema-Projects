/**
 * Vercel Edge Function — AI Proxy
 * Runs at the edge (closest region to the user) — no cold starts, global coverage.
 *
 * Environment variables (set in Vercel Dashboard → Settings → Environment Variables):
 *   AI_API_KEY            = your Groq/OpenAI/etc key
 *   AI_BASE_URL           = https://api.groq.com/openai/v1
 *   AI_MODEL              = llama-3.3-70b-versatile
 *   AI_MODEL_FALLBACK_1   = llama-3.1-8b-instant
 *   AI_MODEL_FALLBACK_2   = (optional)
 *   AI_MODEL_FALLBACK_3   = (optional)
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

// ─── Model chain ──────────────────────────────────────────────────────────────

function getChain(): { apiKey: string; baseUrl: string; model: string }[] {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl =
    process.env.AI_BASE_URL?.trim() || 'https://api.groq.com/openai/v1';

  if (!apiKey) return [];

  const models = [
    process.env.AI_MODEL,
    process.env.AI_MODEL_FALLBACK_1,
    process.env.AI_MODEL_FALLBACK_2,
    process.env.AI_MODEL_FALLBACK_3,
  ]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model));

  return models.map((model) => ({
    apiKey,
    baseUrl,
    model,
  }));
}

// ─── CORS helpers ─────────────────────────────────────────────────────────────

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin':  origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors   = corsHeaders(origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const chain = getChain();
  if (chain.length === 0) {
    return new Response(
      JSON.stringify({ error: 'AI_API_KEY not configured in Vercel environment variables.' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  // Parse request body
  let body: {
    messages?: unknown[];
    temperature?: number;
    max_tokens?: number;
    response_format?: unknown;
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

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
          response_format: body.response_format,
          stream:          false,
        }),
      });

      const data = await upstream.json() as Record<string, unknown>;

      // Rate limit → try next model
      if ((upstream.status === 429 || upstream.status === 403) && i < chain.length - 1) {
        continue;
      }

      return new Response(
        JSON.stringify({ ...data, _model_used: model }),
        {
          status: upstream.status,
          headers: { ...cors, 'Content-Type': 'application/json' },
        },
      );

    } catch (err) {
      if (i === chain.length - 1) {
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : 'Upstream request failed' }),
          { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
        );
      }
    }
  }

  return new Response(JSON.stringify({ error: 'All AI models unavailable' }), {
    status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
