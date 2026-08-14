import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Entity, Field, Relationship, RelationshipType, SchemaModel } from '../types';
import {
  addEntity,
  addField,
  addRelationship,
  cloneSchema,
  createEmptySchema,
  deleteEntity,
  deleteField,
  deleteRelationship,
  renameEntity,
  setEntityPosition,
  updateEntity,
  updateField,
  updateRelationship,
  addEnum,
  renameEnum,
  deleteEnum,
  addEnumValue,
  removeEnumValue,
  addIndex,
  deleteIndex,
} from '../core/schema';
import { createManyToManyJunction, createSelfRelationship } from '../core/relationships';
import { validateSchema } from '../core/validation';
import type { ValidationResult } from '../types';

const MAX_HISTORY = 50;

type SchemaSnapshot = {
  schema: SchemaModel;
  timestamp: number;
};

type SchemaStoreState = {
  schema: SchemaModel;
  history: SchemaSnapshot[];
  historyIndex: number;
  validation: ValidationResult;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
};

type SchemaStoreActions = {
  initSchema: (name: string, description?: string) => void;
  loadSchema: (schema: SchemaModel) => void;
  commitSchema: (schema: SchemaModel) => void;

  addEntity: (name: string, description?: string) => void;
  updateEntity: (entityId: string, updates: Partial<Omit<Entity, 'id'>>) => void;
  renameEntity: (entityId: string, newName: string) => void;
  deleteEntity: (entityId: string) => void;
  setEntityPosition: (entityId: string, x: number, y: number) => void;

  addField: (
    entityId: string,
    name: string,
    type: Field['type'],
    options?: Partial<Omit<Field, 'id' | 'name' | 'type'>>,
  ) => void;
  updateField: (
    entityId: string,
    fieldId: string,
    updates: Partial<Omit<Field, 'id'>>,
  ) => void;
  deleteField: (entityId: string, fieldId: string) => void;

  addRelationship: (
    sourceEntityId: string,
    targetEntityId: string,
    type: RelationshipType,
    options?: Partial<Omit<Relationship, 'id' | 'sourceEntityId' | 'targetEntityId' | 'type'>>,
  ) => void;
  addManyToManyRelationship: (
    sourceEntityId: string,
    targetEntityId: string,
    junctionName?: string,
  ) => void;
  addSelfRelationship: (
    entityId: string,
    fieldName: string,
    type?: 'one-to-one' | 'one-to-many' | 'many-to-one',
  ) => void;
  updateRelationship: (
    relationshipId: string,
    updates: Partial<Omit<Relationship, 'id'>>,
  ) => void;
  deleteRelationship: (relationshipId: string) => void;

  // Enum actions
  addEnum: (name: string) => void;
  renameEnum: (enumId: string, newName: string) => void;
  deleteEnum: (enumId: string) => void;
  addEnumValue: (enumId: string, value: string) => void;
  removeEnumValue: (enumId: string, value: string) => void;

  // Index actions
  addIndex: (name: string, entityId: string, fieldIds: string[], unique: boolean) => void;
  deleteIndex: (indexId: string) => void;

  selectEntity: (entityId: string | null) => void;
  selectRelationship: (relationshipId: string | null) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  revalidate: () => void;
};

export type SchemaStore = SchemaStoreState & SchemaStoreActions;

function createInitialState(): SchemaStoreState {
  const schema = createEmptySchema('Untitled Schema');
  return {
    schema,
    history: [{ schema: cloneSchema(schema), timestamp: Date.now() }],
    historyIndex: 0,
    validation: validateSchema(schema),
    selectedEntityId: null,
    selectedRelationshipId: null,
  };
}

function pushHistory(
  state: SchemaStoreState,
  nextSchema: SchemaModel,
): Pick<SchemaStoreState, 'schema' | 'history' | 'historyIndex' | 'validation'> {
  const trimmedHistory = state.history.slice(0, state.historyIndex + 1);
  const snapshot: SchemaSnapshot = {
    schema: cloneSchema(nextSchema),
    timestamp: Date.now(),
  };

  let history = [...trimmedHistory, snapshot];
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }

  return {
    schema: nextSchema,
    history,
    historyIndex: history.length - 1,
    validation: validateSchema(nextSchema),
  };
}

export const useSchemaStore = create<SchemaStore>()(
  persist(
    (set, get) => ({
  ...createInitialState(),

  initSchema: (name, description) => {
    const schema = createEmptySchema(name, description);
    set({
      schema,
      history: [{ schema: cloneSchema(schema), timestamp: Date.now() }],
      historyIndex: 0,
      validation: validateSchema(schema),
      selectedEntityId: null,
      selectedRelationshipId: null,
    });
  },

  loadSchema: (schema) => {
    set({
      ...pushHistory(createInitialState(), schema),
      selectedEntityId: null,
      selectedRelationshipId: null,
    });
  },

  commitSchema: (schema) => {
    set((state) => pushHistory(state, schema));
  },

  addEntity: (name, description) => {
    set((state) => pushHistory(state, addEntity(state.schema, name, { description })));
  },

  updateEntity: (entityId, updates) => {
    set((state) => pushHistory(state, updateEntity(state.schema, entityId, updates)));
  },

  renameEntity: (entityId, newName) => {
    set((state) => pushHistory(state, renameEntity(state.schema, entityId, newName)));
  },

  deleteEntity: (entityId) => {
    set((state) => ({
      ...pushHistory(state, deleteEntity(state.schema, entityId)),
      selectedEntityId:
        state.selectedEntityId === entityId ? null : state.selectedEntityId,
    }));
  },

  setEntityPosition: (entityId, x, y) => {
    set((state) =>
      pushHistory(state, setEntityPosition(state.schema, entityId, { x, y })),
    );
  },

  addField: (entityId, name, type, options) => {
    set((state) =>
      pushHistory(state, addField(state.schema, entityId, name, type, options)),
    );
  },

  updateField: (entityId, fieldId, updates) => {
    set((state) =>
      pushHistory(state, updateField(state.schema, entityId, fieldId, updates)),
    );
  },

  deleteField: (entityId, fieldId) => {
    set((state) =>
      pushHistory(state, deleteField(state.schema, entityId, fieldId)),
    );
  },

  addRelationship: (sourceEntityId, targetEntityId, type, options) => {
    set((state) =>
      pushHistory(
        state,
        addRelationship(state.schema, sourceEntityId, targetEntityId, type, options),
      ),
    );
  },

  addManyToManyRelationship: (sourceEntityId, targetEntityId, junctionName) => {
    set((state) => {
      const result = createManyToManyJunction(
        state.schema,
        sourceEntityId,
        targetEntityId,
        { junctionName },
      );
      return pushHistory(state, result.schema);
    });
  },

  addSelfRelationship: (entityId, fieldName, type) => {
    set((state) =>
      pushHistory(state, createSelfRelationship(state.schema, entityId, fieldName, type)),
    );
  },

  updateRelationship: (relationshipId, updates) => {
    set((state) =>
      pushHistory(state, updateRelationship(state.schema, relationshipId, updates)),
    );
  },

  deleteRelationship: (relationshipId) => {
    set((state) => ({
      ...pushHistory(state, deleteRelationship(state.schema, relationshipId)),
      selectedRelationshipId:
        state.selectedRelationshipId === relationshipId
          ? null
          : state.selectedRelationshipId,
    }));
  },

  // ── Enum actions ──────────────────────────────────────────────────────────

  addEnum: (name) => {
    set((state) => pushHistory(state, addEnum(state.schema, name)));
  },

  renameEnum: (enumId, newName) => {
    set((state) => pushHistory(state, renameEnum(state.schema, enumId, newName)));
  },

  deleteEnum: (enumId) => {
    set((state) => pushHistory(state, deleteEnum(state.schema, enumId)));
  },

  addEnumValue: (enumId, value) => {
    set((state) => pushHistory(state, addEnumValue(state.schema, enumId, value)));
  },

  removeEnumValue: (enumId, value) => {
    set((state) => pushHistory(state, removeEnumValue(state.schema, enumId, value)));
  },

  // ── Index actions ─────────────────────────────────────────────────────────

  addIndex: (name, entityId, fieldIds, unique) => {
    set((state) => pushHistory(state, addIndex(state.schema, name, entityId, fieldIds, unique)));
  },

  deleteIndex: (indexId) => {
    set((state) => pushHistory(state, deleteIndex(state.schema, indexId)));
  },

  // ── Selection ─────────────────────────────────────────────────────────────

  selectEntity: (entityId) => {
    set({ selectedEntityId: entityId, selectedRelationshipId: null });
  },

  selectRelationship: (relationshipId) => {
    set({ selectedRelationshipId: relationshipId, selectedEntityId: null });
  },

  // ── History ───────────────────────────────────────────────────────────────

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;

    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    if (!snapshot) return;

    set({
      historyIndex: newIndex,
      schema: cloneSchema(snapshot.schema),
      validation: validateSchema(snapshot.schema),
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;

    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    if (!snapshot) return;

    set({
      historyIndex: newIndex,
      schema: cloneSchema(snapshot.schema),
      validation: validateSchema(snapshot.schema),
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  revalidate: () => {
    set((state) => ({ validation: validateSchema(state.schema) }));
  },
}),
    {
      name: 'ai-schema-builder-state',
      // Persist only the schema and history — not selection state
      partialize: (state) => ({
        schema:       state.schema,
        history:      state.history,
        historyIndex: state.historyIndex,
      }),
      // After rehydration, recompute validation from persisted schema
      onRehydrateStorage: () => (state) => {
        if (state?.schema) {
          state.validation = validateSchema(state.schema);
        }
      },
    },
  ),
);
