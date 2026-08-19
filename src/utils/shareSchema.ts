/**
 * Share via URL — encodes the schema as a compressed base64 URL parameter.
 * Uses CompressionStream (deflate-raw) when available; falls back to plain
 * btoa/atob for older browsers.
 */
import type { SchemaModel } from '../types';

// ── Helpers ────────────────────────────────────────────────────

async function compress(input: string): Promise<string> {
  const enc = new TextEncoder();
  const bytes = enc.encode(input);

  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const compressed = await new Response(cs.readable).arrayBuffer();
    // base64url encode
    const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
    return 'z:' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Fallback — no compression, just encode
  return 'r:' + btoa(encodeURIComponent(input));
}

async function decompress(raw: string): Promise<string> {
  if (raw.startsWith('z:')) {
    const b64 = raw.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const decompressed = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(decompressed);
  }

  if (raw.startsWith('r:')) {
    return decodeURIComponent(atob(raw.slice(2)));
  }

  // Legacy format (plain btoa — older share links)
  return decodeURIComponent(atob(raw));
}

// ── Public API ─────────────────────────────────────────────────

export async function encodeSchemaToURL(schema: SchemaModel): Promise<string> {
  const json    = JSON.stringify(schema);
  const encoded = await compress(json);
  const url     = new URL(window.location.href);
  url.searchParams.set('schema', encoded);
  return url.toString();
}

export async function decodeSchemaFromURL(): Promise<SchemaModel | null> {
  try {
    const params  = new URLSearchParams(window.location.search);
    const encoded = params.get('schema');
    if (!encoded) return null;
    const json = await decompress(encoded);
    return JSON.parse(json) as SchemaModel;
  } catch {
    return null;
  }
}

export function clearSchemaFromURL(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('schema');
  window.history.replaceState({}, '', url.toString());
}
