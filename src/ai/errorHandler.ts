/**
 * AI Error Handler — translates server error payloads into Arabic user messages.
 *
 * The proxy (/api/ai-proxy) returns:
 *   { error: string, error_code: string, retry_after_secs: number | null }
 *
 * This module formats them into clear, human-friendly Arabic messages with
 * an optional live countdown if retry_after_secs is present.
 */

export type AIErrorPayload = {
  error?: string;
  error_code?: string;
  retry_after_secs?: number | null;
};

/** Format seconds into a concise Arabic string, e.g. "3 دقائق و20 ثانية" */
export function formatRetryTime(secs: number): string {
  const s = Math.ceil(secs);
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

/**
 * Build the final message shown to the user.
 * Uses the server-side error message directly (already in Arabic) and
 * appends a countdown badge if retry_after_secs is known.
 */
export function buildClientError(payload: AIErrorPayload): string {
  const base = payload.error ?? 'حدث خطأ غير متوقع. حاول مرة أخرى.';

  // The server already computed the Arabic message including retry time,
  // so we just return it directly.
  return base;
}

/**
 * Parse an error response body (text or already parsed object) and
 * return the user-facing message + optional retry seconds.
 */
export function parseAIError(raw: string): { message: string; retryAfterSecs: number | null } {
  try {
    const parsed = JSON.parse(raw) as AIErrorPayload;
    return {
      message:        buildClientError(parsed),
      retryAfterSecs: parsed.retry_after_secs ?? null,
    };
  } catch {
    return {
      message:        'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. حاول مرة أخرى.',
      retryAfterSecs: null,
    };
  }
}
