/**
 * Repository Cache
 * Caches AI analysis results per file using SHA-256 content hashes.
 * Prevents re-analyzing unchanged files across multiple sessions.
 */
import type { AISchemaResponse } from '../engine';

const CACHE_KEY = 'github-analyzer-cache-v1';
const MAX_CACHE_ENTRIES = 500;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CacheEntry = {
  sha: string;            // GitHub tree SHA (changes when file changes)
  contentHash: string;    // FNV-1a hash of content (client-side, no crypto API needed)
  result: AISchemaResponse | null;
  cachedAt: number;
};

type CacheStore = Record<string, CacheEntry>;

// ─── Simple FNV-1a hash (no async, no crypto API required) ───────────────────

function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ─── Cache I/O ────────────────────────────────────────────────────────────────

function loadCache(): CacheStore {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function saveCache(store: CacheStore): void {
  try {
    // Evict expired and oldest entries if over limit
    const now = Date.now();
    let entries = Object.entries(store)
      .filter(([, v]) => now - v.cachedAt < CACHE_TTL_MS)
      .sort(([, a], [, b]) => b.cachedAt - a.cachedAt);

    if (entries.length > MAX_CACHE_ENTRIES) {
      entries = entries.slice(0, MAX_CACHE_ENTRIES);
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage full — fail silently
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class RepoCache {
  private store: CacheStore;

  constructor() {
    this.store = loadCache();
  }

  private key(repoFullName: string, filePath: string): string {
    return `${repoFullName}::${filePath}`;
  }

  /** Check if a file is cached and still valid */
  get(
    repoFullName: string,
    filePath: string,
    sha: string,
    content: string,
  ): AISchemaResponse | null | undefined {
    const k     = this.key(repoFullName, filePath);
    const entry = this.store[k];
    if (!entry) return undefined; // not cached

    const hash = fnv1a(content);
    if (entry.sha !== sha || entry.contentHash !== hash) return undefined; // stale

    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return undefined; // expired

    return entry.result; // null means "file analyzed, no schema found"
  }

  /** Store result for a file */
  set(
    repoFullName: string,
    filePath: string,
    sha: string,
    content: string,
    result: AISchemaResponse | null,
  ): void {
    const k = this.key(repoFullName, filePath);
    this.store[k] = {
      sha,
      contentHash: fnv1a(content),
      result,
      cachedAt: Date.now(),
    };
    saveCache(this.store);
  }

  /** How many entries are cached */
  size(): number {
    return Object.keys(this.store).length;
  }

  /** Clear all cached entries */
  clear(): void {
    this.store = {};
    localStorage.removeItem(CACHE_KEY);
  }
}

export const repoCache = new RepoCache();
