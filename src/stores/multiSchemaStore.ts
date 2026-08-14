/**
 * Multi-Schema Store — manages multiple schema tabs.
 * When user is authenticated, schemas are synced to Supabase.
 * When not authenticated, falls back to localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SchemaModel } from '../types';
import { createEmptySchema } from '../core/schema/factory';
import { generateId } from '../utils/id';
import {
  fetchSchemas,
  saveSchema,
  deleteSchemaRemote,
  type RemoteSchema,
} from '../lib/schemas.service';

export type SchemaTab = {
  id: string;          // local tab ID
  remoteId?: string;   // Supabase row ID (undefined if not yet saved)
  schema: SchemaModel;
  label: string;
  isSaving?: boolean;
  lastSaved?: number;
};

type MultiSchemaState = {
  tabs: SchemaTab[];
  activeTabId: string;
  cloudLoaded: boolean;
};

type MultiSchemaActions = {
  newTab: (name?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTabSchema: (id: string, schema: SchemaModel) => void;
  renameTab: (id: string, label: string) => void;
  duplicateTab: (id: string) => void;

  // Cloud sync
  loadFromCloud: () => Promise<void>;
  saveTabToCloud: (id: string) => Promise<void>;
  deleteTabFromCloud: (id: string) => Promise<void>;
  clearCloudData: () => void;
};

export type MultiSchemaStore = MultiSchemaState & MultiSchemaActions;

const makeInitialTab = (): SchemaTab => {
  const schema = createEmptySchema('Untitled Schema');
  return { id: generateId(), schema, label: 'Schema 1' };
};

export const useMultiSchemaStore = create<MultiSchemaStore>()(
  persist(
    (set, get) => ({
      tabs:        [makeInitialTab()],
      activeTabId: '',
      cloudLoaded: false,

      // ── Local tab ops ──────────────────────────────────────────

      newTab: (name) => {
        const id     = generateId();
        const count  = get().tabs.length + 1;
        const schema = createEmptySchema(name ?? `Schema ${count}`);
        const tab: SchemaTab = { id, schema, label: name ?? `Schema ${count}` };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
      },

      closeTab: (id) => {
        set((s) => {
          const remaining = s.tabs.filter((t) => t.id !== id);
          if (remaining.length === 0) {
            const fresh = makeInitialTab();
            return { tabs: [fresh], activeTabId: fresh.id };
          }
          const nextActive = s.activeTabId === id
            ? (remaining[remaining.length - 1]?.id ?? remaining[0]!.id)
            : s.activeTabId;
          return { tabs: remaining, activeTabId: nextActive };
        });
      },

      switchTab: (id) => set({ activeTabId: id }),

      updateTabSchema: (id, schema) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, schema, label: schema.name || t.label } : t,
          ),
        }));
      },

      renameTab: (id, label) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, label } : t)),
        }));
      },

      duplicateTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;
        const newId  = generateId();
        const newTab: SchemaTab = {
          id: newId,
          schema: { ...tab.schema, id: generateId(), name: `${tab.schema.name} (copy)` },
          label: `${tab.label} (copy)`,
          // Don't copy remoteId — it's a new schema
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: newId }));
      },

      // ── Cloud sync ─────────────────────────────────────────────

      loadFromCloud: async () => {
        try {
          const remote: RemoteSchema[] = await fetchSchemas();

          if (remote.length === 0) {
            // User has no cloud schemas — keep local tabs as-is
            set({ cloudLoaded: true });
            return;
          }

          const tabs: SchemaTab[] = remote.map((r) => ({
            id:       generateId(),
            remoteId: r.id,
            schema:   r.data,
            label:    r.name,
            lastSaved: Date.parse(r.updated_at),
          }));

          set({
            tabs,
            activeTabId: tabs[0]!.id,
            cloudLoaded: true,
          });
        } catch (err) {
          console.error('[multiSchemaStore] loadFromCloud failed:', err);
          set({ cloudLoaded: true });
        }
      },

      saveTabToCloud: async (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;

        // Mark as saving
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === id ? { ...t, isSaving: true } : t),
        }));

        try {
          const saved = await saveSchema(tab.schema, tab.remoteId);
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === id
                ? { ...t, remoteId: saved.id, isSaving: false, lastSaved: Date.now() }
                : t,
            ),
          }));
        } catch (err) {
          console.error('[multiSchemaStore] saveTabToCloud failed:', err);
          set((s) => ({
            tabs: s.tabs.map((t) => t.id === id ? { ...t, isSaving: false } : t),
          }));
          throw err;
        }
      },

      deleteTabFromCloud: async (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (tab?.remoteId) {
          try {
            await deleteSchemaRemote(tab.remoteId);
          } catch (err) {
            console.error('[multiSchemaStore] deleteTabFromCloud failed:', err);
          }
        }
        get().closeTab(id);
      },

      clearCloudData: () => {
        const fresh = makeInitialTab();
        set({ tabs: [fresh], activeTabId: fresh.id, cloudLoaded: false });
      },
    }),
    {
      name: 'ai-schema-builder-tabs',
      // Only persist locally when not cloud-loaded
      partialize: (s) => ({
        tabs:        s.tabs,
        activeTabId: s.activeTabId,
        cloudLoaded: s.cloudLoaded,
      }),
    },
  ),
);
