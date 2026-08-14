/**
 * Result Merger
 * Merges multiple AISchemaResponse objects from different batches
 * into a single unified schema — deduplicating entities and relationships.
 */
import type { AISchemaResponse, AIEntity, AIEnum } from '../engine';

export function mergeResults(
  batches: (AISchemaResponse | null)[],
  projectName: string,
  projectDescription: string,
): AISchemaResponse {
  const merged: AISchemaResponse = {
    schemaName: projectName,
    schemaDescription: projectDescription,
    entities: [],
    relationships: [],
    enums: [],
  };

  const entityMap   = new Map<string, AIEntity>();
  const relSeen     = new Set<string>();
  const enumMap     = new Map<string, AIEnum>();

  for (const batch of batches) {
    if (!batch) continue;

    // ── Merge entities ──────────────────────────────────────────────────────
    for (const entity of batch.entities ?? []) {
      const key = entity.name.toLowerCase();
      if (!entityMap.has(key)) {
        entityMap.set(key, { ...entity });
      } else {
        // Entity exists — merge fields (add missing ones)
        const existing = entityMap.get(key)!;
        const fieldNames = new Set(existing.fields.map((f) => f.name.toLowerCase()));
        for (const field of entity.fields ?? []) {
          if (!fieldNames.has(field.name.toLowerCase())) {
            existing.fields.push(field);
            fieldNames.add(field.name.toLowerCase());
          }
        }
        // Prefer non-empty description
        if (!existing.description && entity.description) {
          existing.description = entity.description;
        }
      }
    }

    // ── Merge relationships ─────────────────────────────────────────────────
    for (const rel of batch.relationships ?? []) {
      const key = [
        rel.sourceName.toLowerCase(),
        rel.targetName.toLowerCase(),
        rel.type,
      ].join(':');
      if (!relSeen.has(key)) {
        relSeen.add(key);
        merged.relationships.push(rel);
      }
    }

    // ── Merge enums ─────────────────────────────────────────────────────────
    for (const e of batch.enums ?? []) {
      const key = e.name.toLowerCase();
      if (!enumMap.has(key)) {
        enumMap.set(key, { ...e, values: [...e.values] });
      } else {
        // Merge values
        const existing = enumMap.get(key)!;
        const valSet   = new Set(existing.values);
        for (const v of e.values) {
          if (!valSet.has(v)) { existing.values.push(v); valSet.add(v); }
        }
      }
    }
  }

  merged.entities = Array.from(entityMap.values());
  merged.enums    = Array.from(enumMap.values());

  // ── Post-processing: remove relationships to unknown entities ───────────────
  const knownEntities = new Set(merged.entities.map((e) => e.name.toLowerCase()));
  merged.relationships = merged.relationships.filter(
    (r) =>
      knownEntities.has(r.sourceName.toLowerCase()) &&
      knownEntities.has(r.targetName.toLowerCase()),
  );

  return merged;
}
