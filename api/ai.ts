/**
 * Vercel Edge Function — AI Proxy (legacy /api/ai endpoint)
 * Kept for backwards compatibility. New code uses /api/ai-proxy.
 */

export const config = { runtime: 'edge' };

const ALLOWED_BASES = [
  'https://api.groq.com',
  'https://api.openai.com',
  'https://openrouter.ai',
];

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin':  origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors   = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI_API_KEY not configured on server' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: {
    baseUrl?: string;
    model?: string;
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

  const baseUrl = body.baseUrl ?? 'https://api.groq.com/openai/v1';
  if (!ALLOWED_BASES.some((b) => baseUrl.startsWith(b))) {
    return new Response(JSON.stringify({ error: `Base URL not allowed: ${baseUrl}` }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           body.model ?? (process.env.AI_MODEL ?? 'llama-3.3-70b-versatile'),
        messages:        body.messages,
        temperature:     body.temperature     ?? 0.1,
        max_tokens:      body.max_tokens      ?? 4096,
        response_format: body.response_format,
        stream:          false,
      }),
    });

    const data = await upstream.json() as Record<string, unknown>;
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Upstream request failed' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
}
