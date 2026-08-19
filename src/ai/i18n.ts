/**
 * i18n — Bilingual UI strings for the AI features.
 *
 * detectLang()  → 'ar' | 'en'  based on the user's input text.
 * t(key, lang)  → the translated string.
 *
 * Rule: if >15 % of the characters in the user message are Arabic script →
 * the user is writing in Arabic, otherwise English.
 */

export type Lang = 'ar' | 'en';

/** Detect language from a user-supplied string. */
export function detectLang(text: string): Lang {
  if (!text) return 'en';
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return arabicChars > text.length * 0.15 ? 'ar' : 'en';
}

// ─── String catalogue ─────────────────────────────────────────

const strings = {
  // ── Chat panel ────────────────────────────────────────────────
  chat_empty_has_entities: {
    ar: 'اسألني لتعديل الـ schema — أضف entities أو fields أو علاقات، أو اسألني أي سؤال.',
    en: 'Ask me to edit the schema — add entities, fields, relationships, or ask any question.',
  },
  chat_empty_no_entities: {
    ar: 'ولّد schema أولاً من شريط الـ AI في الأسفل، ثم ارجع هنا للتعديل.',
    en: 'Generate a schema first using the AI bar below, then come back to edit it.',
  },
  chat_placeholder_has_entities: {
    ar: 'اسألني لتعديل الـ schema…',
    en: 'Ask me to edit the schema…',
  },
  chat_placeholder_no_entities: {
    ar: 'ولّد schema أولاً…',
    en: 'Generate a schema first…',
  },
  chat_thinking: {
    ar: 'جاري التفكير…',
    en: 'Thinking…',
  },
  chat_patch_applied: {
    ar: (n: number) => `✓ ${n} تعديل`,
    en: (n: number) => `✓ ${n} change${n === 1 ? '' : 's'} applied`,
  },
  chat_patch_failed: {
    ar: (n: number) => `⚠ ${n} فشل`,
    en: (n: number) => `⚠ ${n} failed`,
  },
  chat_new_conversation: {
    ar: 'محادثة جديدة',
    en: 'New conversation',
  },
  chat_history_title: {
    ar: 'المحادثات المحفوظة',
    en: 'Saved conversations',
  },
  chat_history_empty: {
    ar: 'لا توجد محادثات محفوظة',
    en: 'No saved conversations',
  },
  chat_history_messages: {
    ar: (n: number) => `${n} رسالة`,
    en: (n: number) => `${n} message${n === 1 ? '' : 's'}`,
  },
  chat_dismiss_error: {
    ar: 'تجاهل',
    en: 'Dismiss',
  },
  chat_model_label: {
    ar: 'الـ Model:',
    en: 'Model:',
  },
  chat_history_toggle: {
    ar: 'المحادثات',
    en: 'History',
  },

  // ── AI Command Bar ─────────────────────────────────────────────
  cmd_placeholder: {
    ar: 'اكتب طلبك… مثلاً: "ابني schema لمدرسة فيها طلاب ومدرسين"',
    en: 'Describe your schema… e.g. "Build a school schema with students and teachers"',
  },
  cmd_status_idle: {
    ar: 'AI جاهز',
    en: 'AI ready',
  },
  cmd_status_loading: {
    ar: 'جاري المعالجة…',
    en: 'Processing…',
  },
  cmd_status_streaming: {
    ar: 'جاري التوليد…',
    en: 'Generating…',
  },
  cmd_status_done: {
    ar: 'تم بناء الـ Schema!',
    en: 'Schema built!',
  },
  cmd_status_error: {
    ar: 'حدث خطأ',
    en: 'Error',
  },
  cmd_generating: {
    ar: 'جاري توليد الـ schema…',
    en: 'Generating schema…',
  },
  cmd_dismiss: {
    ar: 'تجاهل',
    en: 'Dismiss',
  },

  // ── Errors (server-side, returned from proxy) ──────────────────
  err_rate_limit: {
    ar: (retry: string | null) =>
      retry ? `الخدمة مشغولة الآن (rate limit). جرب بعد ${retry}.` : 'الخدمة مشغولة الآن. جرب بعد دقيقة.',
    en: (retry: string | null) =>
      retry ? `Service is busy (rate limit). Try again in ${retry}.` : 'Service is busy. Try again in a minute.',
  },
  err_daily_limit: {
    ar: (retry: string | null) =>
      retry ? `وصلت للحد اليومي للاستخدام. جرب بعد ${retry}.` : 'وصلت للحد اليومي للاستخدام. جرب غداً.',
    en: (retry: string | null) =>
      retry ? `Daily usage limit reached. Try again in ${retry}.` : 'Daily usage limit reached. Try tomorrow.',
  },
  err_quota: {
    ar: 'تم تجاوز الحصة المسموح بها. سيتم التجديد قريباً.',
    en: 'Usage quota exceeded. It will reset soon.',
  },
  err_service_down: {
    ar: 'الخدمة غير متاحة مؤقتاً. جرب بعد دقائق.',
    en: 'Service temporarily unavailable. Try again in a few minutes.',
  },
  err_server: {
    ar: 'حدث خطأ في الخادم. جرب مرة أخرى.',
    en: 'Server error. Please try again.',
  },
  err_network: {
    ar: 'حدث خطأ في الاتصال بالخدمة. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    en: 'Connection error. Check your internet and try again.',
  },
  err_all_down: {
    ar: 'جميع خدمات الذكاء الاصطناعي غير متاحة حالياً. جرب بعد دقائق.',
    en: 'All AI services are currently unavailable. Try again in a few minutes.',
  },
  err_unknown: {
    ar: 'حدث خطأ غير متوقع. جرب مرة أخرى.',
    en: 'An unexpected error occurred. Please try again.',
  },
  err_not_configured: {
    ar: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول مرة أخرى لاحقاً.',
    en: 'AI service is not available right now. Please try again later.',
  },

  // ── Retry time ────────────────────────────────────────────────
  retry_seconds: {
    ar: (n: number) => `${n} ثانية`,
    en: (n: number) => `${n} second${n === 1 ? '' : 's'}`,
  },
  retry_minutes: {
    ar: (m: number, s: number) => s > 0 ? `${m} دقيقة و${s} ثانية` : `${m} دقيقة`,
    en: (m: number, s: number) => s > 0 ? `${m} min ${s}s` : `${m} minute${m === 1 ? '' : 's'}`,
  },
  retry_hours: {
    ar: (h: number, m: number) => m > 0 ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`,
    en: (h: number, m: number) => m > 0 ? `${h}h ${m}m` : `${h} hour${h === 1 ? '' : 's'}`,
  },
} as const;

export type StringKey = keyof typeof strings;

/**
 * Get a translated string.
 * For keys that are functions, pass args as the third parameter.
 */
// Simple (non-function) strings
export function t(key: StringKey, lang: Lang): string {
  const entry = strings[key];
  const val = (entry as Record<Lang, unknown>)[lang];
  if (typeof val === 'string') return val;
  // Fallback to English
  const fallback = (entry as Record<Lang, unknown>)['en'];
  if (typeof fallback === 'string') return fallback;
  return String(key);
}

/** Format retry time in the given language */
export function formatRetryTimeLang(secs: number, lang: Lang): string {
  const s = Math.ceil(secs);
  if (s < 60) {
    const fn = strings.retry_seconds[lang] as (n: number) => string;
    return fn(s);
  }
  if (s < 3600) {
    const m   = Math.floor(s / 60);
    const rem = s % 60;
    const fn  = strings.retry_minutes[lang] as (m: number, s: number) => string;
    return fn(m, rem);
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const fn = strings.retry_hours[lang] as (h: number, m: number) => string;
  return fn(h, m);
}

/** Build the user-facing error message in the correct language */
export function buildErrorMessage(
  errorCode: string,
  retryAfterSecs: number | null,
  lang: Lang,
): string {
  const retry = retryAfterSecs !== null ? formatRetryTimeLang(retryAfterSecs, lang) : null;

  switch (errorCode) {
    case 'RATE_LIMIT':
      return (strings.err_rate_limit[lang] as (r: string | null) => string)(retry);
    case 'DAILY_LIMIT':
      return (strings.err_daily_limit[lang] as (r: string | null) => string)(retry);
    case 'QUOTA_EXCEEDED':
      return strings.err_quota[lang] as string;
    case 'SERVICE_DOWN':
      return strings.err_service_down[lang] as string;
    case 'SERVER_ERROR':
      return strings.err_server[lang] as string;
    case 'NETWORK_ERROR':
      return strings.err_network[lang] as string;
    case 'ALL_MODELS_DOWN':
      return strings.err_all_down[lang] as string;
    default:
      return strings.err_unknown[lang] as string;
  }
}
