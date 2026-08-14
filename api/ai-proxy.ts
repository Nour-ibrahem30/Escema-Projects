/**
 * Vercel Serverless Function — AI Proxy
 * Routes AI requests server-side to keep API keys out of the browser bundle.
 *
 * Environment variables to set in Vercel Dashboard:
 *   AI_API_KEY            = your Groq/OpenAI/etc key
 *   AI_BASE_URL           = https://api.groq.com/openai/v1
 *   AI_MODEL              = llama-3.3-70b-versatile
 *   AI_MODEL_FALLBACK_1   = llama-3.1-8b-instant
 *   AI_MODEL_FALLBACK_2   = groq/compound
 *   AI_MODEL_FALLBACK_3   = groq/compound-mini
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Allowed upstream providers (SSRF protection) ────────────────────────────

const ALLOWED_HOSTS = [
  'api.groq.com',
  'api.openai.com',
  'openrouter.ai',
];

function isAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.includes(host);
  } catch {
    return false;
  }
}

// ─── Model chain from server-side env ────────────────────────────────────────

function getServerModelChain(): { apiKey: string; baseUrl: string; model: string }[] {
  const apiKey  = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1';
  const chain: { apiKey: string; baseUrl: string; model: string }[] = [];

  if (!apiKey) return chain;

  const models = [
    process.env.AI_MODEL              ?? 'llama-3.3-70b-versatile',
    process.env.AI_MODEL_FALLBACK_1   ?? 'llama-3.1-8b-instant',
    process.env.AI_MODEL_FALLBACK_2,
    process.env.AI_MODEL_FALLBACK_3,
  ].filter(Boolean) as string[];

  for (const model of models) {
    chain.push({ apiKey, baseUrl, model });
  }

  return chain;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  const chain = getServerModelChain();
  if (chain.length === 0) {
    res.status(500).json({ error: 'AI_API_KEY not configured in Vercel environment variables.' });
    return;
  }

  // Body from browser — messages, temperature, max_tokens, response_format
  const body = req.body as {
    messages?:        unknown[];
    temperature?:     number;
    max_tokens?:      number;
    response_format?: unknown;
    // model override from client (optional — server chain takes precedence)
    preferModel?:     string;
  };

  if (!body.messages || !Array.isArray(body.messages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Try each model in chain
  for (let i = 0; i < chain.length; i++) {
    const { apiKey, baseUrl, model } = chain[i]!;

    if (!isAllowed(baseUrl)) {
      continue;
    }

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
      if (upstream.status === 429 || upstream.status === 403) {
        if (i < chain.length - 1) continue;
        res.status(upstream.status).json({ ...data, _tried_models: chain.map((c) => c.model) });
        return;
      }

      if (!upstream.ok) {
        res.status(upstream.status).json(data);
        return;
      }

      // Success — add which model was used for debugging
      res.status(200).json({ ...data, _model_used: model });
      return;

    } catch (err) {
      if (i === chain.length - 1) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Upstream request failed',
        });
        return;
      }
    }
  }

  res.status(503).json({ error: 'All AI models unavailable' });
}
