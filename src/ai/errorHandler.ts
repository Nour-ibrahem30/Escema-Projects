/**
 * AI Error Handler — translates server error payloads into user-facing messages.
 *
 * The proxy (/api/ai-proxy) returns:
 *   { error: string, error_code: string, retry_after_secs: number | null }
 *
 * The server already localises the error message according to the `lang` field
 * sent by the frontend, so this module simply forwards it.
 * The `lang` parameter here is used only for the fallback/catch-path messages.
 */
import { type Lang, formatRetryTimeLang } from './i18n';

export type { Lang };

export type AIErrorPayload = {
  error?: string;
  error_code?: string;
  retry_after_secs?: number | null;
};

/** @deprecated Use formatRetryTimeLang from i18n instead */
export function formatRetryTime(secs: number): string {
  return formatRetryTimeLang(secs, 'ar');
}

/**
 * Parse an error response body and return:
 *  - message        : user-facing localised string
 *  - retryAfterSecs : seconds until retry, or null
 *
 * Pass `lang` so the catch-path fallback message matches the user's language.
 */
export function parseAIError(
  raw: string,
  lang: Lang = 'ar',
): { message: string; retryAfterSecs: number | null } {
  try {
    const parsed = JSON.parse(raw) as AIErrorPayload;
    // The server already built the message in the correct language.
    const base = parsed.error ?? (
      lang === 'en'
        ? 'An unexpected error occurred. Please try again.'
        : 'حدث خطأ غير متوقع. حاول مرة أخرى.'
    );
    return {
      message:        base,
      retryAfterSecs: parsed.retry_after_secs ?? null,
    };
  } catch {
    return {
      message: lang === 'en'
        ? 'Connection error. Please try again.'
        : 'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. حاول مرة أخرى.',
      retryAfterSecs: null,
    };
  }
}
