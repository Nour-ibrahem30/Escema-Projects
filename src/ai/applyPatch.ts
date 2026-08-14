/**
 * Applies AI chat patch operations to the schema store.
 * IMPORTANT: Each operation reads store.schema fresh so it always sees
 * the latest state — never a stale snapshot from before the loop started.
 */
import type { PatchOp } from './chat';
import type { SchemaStore } from '../stores/schemaStore';

const VALID_TYPES = new Set([
  'string','text','integer','float','decimal',
  'boolean','date','datetime','uuid','json',
]);

function sanitize(t: string): import('../types').Field['type'] {
  const l = (t ?? 'string').toLowerCase().trim();
  if (VALID_TYPES.has(l)) return l as import('../types').Field['type'];
  const map: Record<string, import('../types').Field['type']> = {
    int:'integer', bigint:'integer', number:'integer', serial:'integer',
    varchar:'string', char:'string', nvarchar:'string',
    timestamp:'datetime', timestamptz:'datetime',
    bool:'boolean',
    double:'float', real:'float', numeric:'decimal',
    jsonb:'json',
  };
  return map[l] ?? 'string';
}

// Helper: always read the LATEST schema from the store
const live = (store: SchemaStore) => store.schema;

export function applyPatches(patches: PatchOp[], store: SchemaStore): void {
  let appliedCount = 0;

  for (const patch of patches) {
    try {
      applySinglePatch(patch, store);
      appliedCount++;
    } catch (err) {
      console.warn('[applyPatch] Failed to apply patch:', patch, err);
    }
  }

  console.log(`[applyPatch] Applied ${appliedCount}/${patches.length} patches`);
}

function applySinglePatch(patch: PatchOp, store: SchemaStore): void {
  switch (patch.op) {

    case 'rename_schema': {
      const s = live(store);
      store.commitSchema({ ...s, name: patch.name, version: s.version + 1 });
      break;
    }

    case 'add_entity': {
      store.addEntity(patch.name, patch.description);

      // Re-read schema after addEntity to get the new entity's real ID
      if (patch.fields?.length) {
        const added = live(store).entities.find(
          (e) => e.name.toLowerCase() === patch.name.toLowerCase(),
        );
        if (added) {
          for (const f of patch.fields) {
            if (f.primaryKey || f.name === 'id') continue;
            if (!f.name?.trim()) continue;
            store.addField(added.id, f.name.trim(), sanitize(f.type ?? 'string'), {
              nullable: f.nullable ?? true,
              unique:   f.unique   ?? false,
            });
          }
        }
      }
      break;
    }

    case 'delete_entity': {
      const entity = live(store).entities.find(
        (e) => e.name.toLowerCase() === patch.name.toLowerCase(),
      );
      if (entity) store.deleteEntity(entity.id);
      break;
    }

    case 'rename_entity': {
      const entity = live(store).entities.find(
        (e) => e.name.toLowerCase() === patch.name.toLowerCase(),
      );
      if (entity) store.renameEntity(entity.id, patch.newName);
      break;
    }

    case 'add_field': {
      // Re-read each time in case a previous patch added the entity
      const entity = live(store).entities.find(
        (e) => e.name.toLowerCase() === patch.entity.toLowerCase(),
      );
      if (!entity) {
        console.warn(`[applyPatch] add_field: entity "${patch.entity}" not found`);
        break;
      }
      // Skip if field already exists
      const exists = entity.fields.some(
        (f) => f.name.toLowerCase() === patch.name.toLowerCase(),
      );
      if (exists) break;

      store.addField(entity.id, patch.name, sanitize(patch.type ?? 'string'), {
        nullable: patch.nullable ?? true,
        unique:   patch.unique   ?? false,
      });
      break;
    }

    case 'delete_field': {
      const entity = live(store).entities.find(
        (e) => e.name.toLowerCase() === patch.entity.toLowerCase(),
      );
      if (entity) {
        const field = entity.fields.find(
          (f) => f.name.toLowerCase() === patch.name.toLowerCase(),
        );
        if (field && !field.primaryKey) store.deleteField(entity.id, field.id);
      }
      break;
    }

    case 'update_field': {
      const entity = live(store).entities.find(
        (e) => e.name.toLowerCase() === patch.entity.toLowerCase(),
      );
      if (entity) {
        const field = entity.fields.find(
          (f) => f.name.toLowerCase() === patch.name.toLowerCase(),
        );
        if (field) {
          const upd = patch.updates;
          store.updateField(entity.id, field.id, {
            ...(upd.name     !== undefined ? { name: upd.name }             : {}),
            ...(upd.type     !== undefined ? { type: sanitize(upd.type!) }  : {}),
            ...(upd.nullable !== undefined ? { nullable: upd.nullable }     : {}),
            ...(upd.unique   !== undefined ? { unique:   upd.unique }       : {}),
          });
        }
      }
      break;
    }

    case 'add_relationship': {
      const s   = live(store);
      const src = s.entities.find((e) => e.name.toLowerCase() === patch.sourceName.toLowerCase());
      const tgt = s.entities.find((e) => e.name.toLowerCase() === patch.targetName.toLowerCase());
      if (!src || !tgt) {
        console.warn(`[applyPatch] add_relationship: entity not found "${patch.sourceName}" or "${patch.targetName}"`);
        break;
      }
      const type = patch.type as import('../types').RelationshipType;
      if (type === 'many-to-many') {
        store.addManyToManyRelationship(src.id, tgt.id);
      } else {
        store.addRelationship(src.id, tgt.id, type || 'one-to-many', { name: patch.name });
      }
      break;
    }

    case 'delete_relationship': {
      const s   = live(store);
      const src = s.entities.find((e) => e.name.toLowerCase() === patch.sourceName.toLowerCase());
      const tgt = s.entities.find((e) => e.name.toLowerCase() === patch.targetName.toLowerCase());
      if (src && tgt) {
        const rel = s.relationships.find(
          (r) => r.sourceEntityId === src.id && r.targetEntityId === tgt.id,
        );
        if (rel) store.deleteRelationship(rel.id);
      }
      break;
    }

    case 'add_enum': {
      store.addEnum(patch.name);
      // Re-read to get real enum ID
      for (const v of patch.values ?? []) {
        if (!v) continue;
        const found = live(store).enums.find(
          (e) => e.name.toLowerCase() === patch.name.toLowerCase(),
        );
        if (found) store.addEnumValue(found.id, v.toUpperCase());
      }
      break;
    }

    case 'delete_enum': {
      const found = live(store).enums.find(
        (e) => e.name.toLowerCase() === patch.name.toLowerCase(),
      );
      if (found) store.deleteEnum(found.id);
      break;
    }

    case 'add_enum_value': {
      const found = live(store).enums.find(
        (e) => e.name.toLowerCase() === patch.enumName.toLowerCase(),
      );
      if (found) store.addEnumValue(found.id, patch.value.toUpperCase());
      break;
    }
  }
}
