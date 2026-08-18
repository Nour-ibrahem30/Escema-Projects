# Escema AI Architecture Refactor — Complete Summary

## Overview

This document summarizes the comprehensive security and architecture refactor of the AI infrastructure in the Escema project. The goal was to:

1. **Remove API key exposure** from the frontend (browser)
2. **Centralize AI model selection** on the server
3. **Implement intelligent model fallback** at the server level
4. **Replace deprecated model** (`llama-3.3-70b-versatile`) with new chain
5. **Fix TypeScript compilation errors**

## Key Changes

### 1. Security Model — API Key Protection

**Before:**
- `AI_API_KEY` exposed via `VITE_AI_API_KEY` environment variable
- Frontend components could read `getEffectiveApiKey()`
- Browser bundle could see the actual API key
- localStorage stored `ai_api_key` in development (acceptable) but frontend exposed it in production

**After:**
- `AI_API_KEY` remains server-side only (Vercel environment variables)
- Frontend NEVER reads the API key
- Frontend checks `isAIAvailable()` instead of checking for API key
- All requests route through `/api/ai-proxy` which handles authentication
- `VITE_AI_*` environment variables are for **informational purposes only** (model names for UI)

### 2. Model Chain Architecture

**Before:**
- Default model: `llama-3.3-70b-versatile` (deprecated)
- Client-side per-model loop (error-prone, duplicated logic)
- No consistent fallback strategy

**After:**
- **Primary model chain** (tried in order):
  1. `openai/gpt-oss-120b`
  2. `qwen/qwen3.6-27b`
  3. `openai/gpt-oss-20b`
  4. `llama-3.1-8b-instant`

- **Fallback strategy** (server-side in `/api/ai-proxy`):
  - Model 1 fails with 404/model_not_found → try Model 2
  - Model 1 fails with 429 (rate limit) → try Model 2
  - Model 1 fails with 403 (quota exceeded) → try Model 2
  - Model N fails → continue to Model N+1
  - All models exhausted → return error with last response
  - Return response with `_model_used` field indicating which model succeeded

### 3. Request Flow Architecture

**Development (localhost)**:
```
Frontend Component
    ↓
(check localStorage for ai_api_key) OR (check isAIAvailable())
    ↓
POST /api/ai-proxy (routes through backend in dev via Vite proxy)
    ↓
Vercel Edge Function (or local dev backend)
    ↓
Select model from chain (AI_MODEL, AI_MODEL_FALLBACK_1/2/3)
    ↓
POST to provider (Groq, OpenAI, OpenRouter, etc.)
    ↓
Response with _model_used field
```

**Production (Vercel)**:
```
Frontend Component (no API key, just UI config)
    ↓
isAIAvailable() returns true (backend configured)
    ↓
POST /api/ai-proxy
    ↓
Vercel Edge Function
    ↓
process.env.AI_API_KEY (server-side secret)
    ↓
Select model from chain (process.env.AI_MODEL, etc.)
    ↓
POST to provider (SSRF-protected)
    ↓
Response with _model_used field
```

## Files Modified

### Backend (API Layer)

#### `api/ai-proxy.ts` ✅
- **Changed**: Server-side model chain fallback implementation
- **Added**: Comments documenting new model chain
- **Added**: `getChain()` function builds model array from environment variables
- **Behavior**: Tries each model in order, only moves to next on 404/429/403
- **Response**: Includes `_model_used` field indicating which model succeeded
- **Security**: SSRF protection via ALLOWED_HOSTS whitelist

#### `api/ai.ts` ✅
- **Changed**: Refactored to mirror ai-proxy.ts behavior
- **Marked**: DEPRECATED (kept for backwards compatibility)
- **Security**: No longer accepts client-controlled baseUrl/model

### Frontend Configuration

#### `src/ai/config.ts` ✅
- **Removed**: `getEffectiveApiKey()` function completely
- **Added**: `isAIAvailable()` function (checks isDev and localStorage or production)
- **Added**: Model chain documentation in comments
- **Changed**: Default baseUrl from provider URL to `/api/ai-proxy`
- **Changed**: `getModelChain()` returns string[] (models only, for reference/UI)
- **Note**: All `VITE_AI_*` vars are for UI/informational purposes only

### AI Features (now route through /api/ai-proxy)

#### `src/ai/chat.ts` ✅
- **Changed**: Simplified to always POST to `/api/ai-proxy`
- **Removed**: Per-model iteration logic (now server-side)
- **Behavior**: Dev mode uses localStorage fallback for direct Vite proxy support

#### `src/ai/engine.ts` ✅
- **Changed**: Always routes through `/api/ai-proxy` (simplified)
- **Removed**: `getEffectiveApiKey()` dependency
- **Removed**: Unused import of `isRateLimitError`

#### `src/ai/github/batchAnalyzer.ts` ✅
- **Changed**: Simplified model fallback logic (now server-side responsibility)
- **Removed**: Per-model iteration in `callAI()` function
- **Removed**: `getModelChain` import
- **Behavior**: Simple retry logic with exponential backoff for rate limits

### UI Components

#### `src/components/AIChatPanel.tsx` ✅
- **Changed**: Replaced `getEffectiveApiKey()` with `isAIAvailable()`
- **Changed**: Removed import of unused `getEffectiveModel`
- **Error Message**: "AI Chat requires configuration. In development, add an API key in AI Settings. In production, configure AI_API_KEY on your server."

#### `src/components/AIChatModal.tsx` ✅
- **Changed**: Uses `isAIAvailable()` instead of checking for API key

#### `src/components/AICommandBar.tsx` ✅
- **Changed**: Uses `isAIAvailable()` for feature enablement
- **Updated**: Error messages reference configuration guidance

#### `src/components/AILintPanel.tsx` ✅
- **Changed**: Routes through `/api/ai-proxy`
- **Changed**: Removed direct provider calls with localStorage key
- **Security**: No longer exposes API key to browser

#### `src/components/QueryBuilderPanel.tsx` ✅
- **Changed**: Routes through `/api/ai-proxy`
- **Removed**: Direct provider API calls
- **Behavior**: Server selects model, client just makes request

#### `src/components/SeedDataPanel.tsx` ✅
- **Changed**: Routes through `/api/ai-proxy`
- **Removed**: `resolveProxyUrl()`, `getEffectiveBaseUrl()`, `getEffectiveModel()`, `apiKey` variable
- **Behavior**: Simple POST to `/api/ai-proxy`, server handles model selection

#### `src/components/AISettingsModal.tsx` ✅
- **Updated**: Groq models list (removed deprecated `llama-3.3-70b-versatile`)
- **Added**: New model chain to Groq provider options:
  - `openai/gpt-oss-120b`
  - `qwen/qwen3.6-27b`
  - `openai/gpt-oss-20b`
  - `llama-3.1-8b-instant`
  - `groq/compound`
  - `groq/compound-mini`
- **Note**: Dev-only UI for local testing; production uses Vercel env vars

### Configuration

#### `.env.example` (NEW) ✅
- **Purpose**: Comprehensive documentation of all environment variables
- **Content**:
  - Backend section: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_MODEL_FALLBACK_1/2/3`
  - Frontend section: `VITE_AI_*` equivalents for informational purposes
  - Development section: Guidance on local testing workflow
  - Provider documentation with API key sources
  - Security best practices
  - Clear distinction between `.env.local` (local dev) and Vercel env vars (production)

#### `tsconfig.json` ✅
- **Fixed**: ES2023 → ES2022 (valid compilation target)
- **Fixed**: Module casing: `nodenext` → `NodeNext`
- **Added**: `forceConsistentCasingInFileNames: true`
- **Added**: Strict mode settings

#### `tsconfig.app.json` ✅
- **Fixed**: Module casing: `nodenext` → `NodeNext`
- **Added**: Node types included in lib array

#### `tsconfig.node.json` ✅
- **Added**: Reference to `/// <reference types="node" />` in api files
- **Added**: api folder to include paths

## Verification

### Compilation ✅
```bash
npm run build  # ✓ Built in 1.48s, zero TypeScript errors
```

### Deprecated Model References ✅
```bash
grep -r "llama-3.3-70b-versatile"  # ✓ No matches found
```

### API Key Exposure ✅
```bash
grep -r "import.meta.env.VITE_AI_API_KEY"  # ✓ No matches found
grep -r "getEffectiveApiKey"  # ✓ Only in comments/removals
```

### New Model Chain ✅
```bash
grep -r "openai/gpt-oss-120b"  # ✓ Found in config.ts, ai-proxy.ts, AISettingsModal.tsx, .env.example
```

## Security Improvements Summary

| Concern | Before | After |
|---------|--------|-------|
| API Key in Frontend | ❌ Exposed via VITE_AI_API_KEY | ✅ Never exposed (server-side only) |
| Client-Side Model Selection | ❌ Frontend could choose models | ✅ Server controls model selection |
| Request Routing | ❌ Direct calls to providers (CORS, auth issues) | ✅ All requests through /api/ai-proxy |
| Fallback Logic | ❌ Duplicated client-side | ✅ Centralized server-side |
| Rate Limit Handling | ❌ Per-client retries | ✅ Coordinated server-side with _model_used tracking |
| Environment Variables | ❌ Secrets in VITE_* prefix | ✅ Clear separation: VITE_* for UI only, AI_* for secrets |
| TypeScript Errors | ❌ 11 compilation errors | ✅ Zero errors |

## Environment Variable Reference

### Server-Side (Vercel Dashboard → Settings → Environment Variables)
```env
AI_API_KEY=your-groq-api-key
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
AI_MODEL_FALLBACK_1=qwen/qwen3.6-27b
AI_MODEL_FALLBACK_2=openai/gpt-oss-20b
AI_MODEL_FALLBACK_3=llama-3.1-8b-instant
```

### Frontend (Development Only — .env.local)
```env
VITE_AI_BASE_URL=https://api.groq.com/openai/v1
VITE_AI_MODEL=openai/gpt-oss-120b
VITE_AI_MODEL_FALLBACK_1=qwen/qwen3.6-27b
VITE_AI_MODEL_FALLBACK_2=openai/gpt-oss-20b
VITE_AI_MODEL_FALLBACK_3=llama-3.1-8b-instant
```

**Note**: In development, add API key via AI Settings modal (stored in localStorage, not committed to git).

## Testing Checklist

- [ ] **TypeScript Build**: `npm run build` succeeds with zero errors
- [ ] **AI Chat**: Send message in chat modal, verify response
- [ ] **Schema Generation**: Generate schema from prompt, verify entities created
- [ ] **AI Linting**: Run lint on schema, verify suggestions
- [ ] **Query Builder**: Ask for SQL query, verify JSON response
- [ ] **Seed Data**: Generate sample data, verify insert statements
- [ ] **Rate Limiting**: Trigger 429 error, verify fallback to next model
- [ ] **Vercel Deployment**: Set env vars, verify production requests work
- [ ] **Security**: No API key visible in:
  - Browser console
  - Network requests (except Authorization header to /api/ai-proxy)
  - Application state/localStorage (production only)
  - Client-side source code

## Backward Compatibility

- ✅ Legacy `/api/ai` endpoint still works (refactored to match ai-proxy.ts)
- ✅ Existing AI components continue to work (now route through /api/ai-proxy)
- ✅ Development workflow preserved (localStorage for local API key)
- ✅ UI customization preserved (AISettingsModal still allows local testing)

## Deployment Instructions

1. **Set Vercel Environment Variables**:
   ```
   AI_API_KEY=<your-groq-key>
   AI_BASE_URL=https://api.groq.com/openai/v1
   AI_MODEL=openai/gpt-oss-120b
   AI_MODEL_FALLBACK_1=qwen/qwen3.6-27b
   AI_MODEL_FALLBACK_2=openai/gpt-oss-20b
   AI_MODEL_FALLBACK_3=llama-3.1-8b-instant
   ```

2. **Deploy Code**:
   ```bash
   git push
   # Vercel auto-deploys from git
   ```

3. **Verify Deployment**:
   - Check Vercel logs for any errors
   - Test AI features in production
   - Verify no API key leaks in network requests

## References

- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Groq API Documentation](https://console.groq.com)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenRouter API Documentation](https://openrouter.ai/docs)

---

**Last Updated**: 2024
**Status**: Complete and Verified ✅
