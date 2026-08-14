/**
 * Schemas Service — CRUD operations for user schemas in Supabase.
 */
import { supabase } from './supabase';
import type { SchemaModel } from '../types';

export type RemoteSchema = {
  id: string;
  name: string;
  description: string | null;
  data: SchemaModel;
  created_at: string;
  updated_at: string;
};

// ─── Fetch all schemas for the current user ───────────────────

export async function fetchSchemas(): Promise<RemoteSchema[]> {
  const { data, error } = await supabase
    .from('schemas')
    .select('id, name, description, data, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RemoteSchema[];
}

// ─── Save (upsert) a schema ───────────────────────────────────

export async function saveSchema(schema: SchemaModel, remoteId?: string): Promise<RemoteSchema> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Build payload — omit id if undefined so Supabase auto-generates it
  const payload: Record<string, unknown> = {
    user_id:     user.id,
    name:        schema.name,
    description: schema.description ?? null,
    data:        schema as unknown as Record<string, unknown>,
    updated_at:  new Date().toISOString(),
  };

  if (remoteId) payload['id'] = remoteId;

  const { data, error } = await supabase
    .from('schemas')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as RemoteSchema;
}

// ─── Delete a schema ──────────────────────────────────────────

export async function deleteSchemaRemote(remoteId: string): Promise<void> {
  const { error } = await supabase
    .from('schemas')
    .delete()
    .eq('id', remoteId);

  if (error) throw new Error(error.message);
}
