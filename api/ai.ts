/**
 * Vercel Serverless Function — AI Proxy
 * Keeps the AI API key server-side, never exposed to the browser.
 *
 * POST /api/ai
 * Body: { baseUrl: string; model: string; messages: [...]; ... }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_BASES = [
  'https://api.groq.com',
  'https://api.openai.com',
  'https://openrouter.ai',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for the same origin
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'AI_API_KEY not configured on server' });
    return;
  }

  const body = req.body as {
    baseUrl?: string;
    model?: string;
    messages?: unknown[];
    temperature?: number;
    max_tokens?: number;
    response_format?: unknown;
    stream?: boolean;
  };

  // Validate base URL to prevent SSRF
  const baseUrl = body.baseUrl ?? 'https://api.groq.com/openai/v1';
  const isAllowed = ALLOWED_BASES.some((b) => baseUrl.startsWith(b));
  if (!isAllowed) {
    res.status(400).json({ error: `Base URL not allowed: ${baseUrl}` });
    return;
  }

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           body.model,
        messages:        body.messages,
        temperature:     body.temperature ?? 0.1,
        max_tokens:      body.max_tokens  ?? 4096,
        response_format: body.response_format,
        stream:          false,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Upstream request failed',
    });
  }
}
