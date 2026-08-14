/**
 * Share via URL — encodes the schema as a compressed base64 URL parameter.
 */
import type { SchemaModel } from '../types';

export function encodeSchemaToURL(schema: SchemaModel): string {
  const json    = JSON.stringify(schema);
  const encoded = btoa(encodeURIComponent(json));
  const url     = new URL(window.location.href);
  url.searchParams.set('schema', encoded);
  return url.toString();
}

export function decodeSchemaFromURL(): SchemaModel | null {
  try {
    const params  = new URLSearchParams(window.location.search);
    const encoded = params.get('schema');
    if (!encoded) return null;
    const json = decodeURIComponent(atob(encoded));
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
