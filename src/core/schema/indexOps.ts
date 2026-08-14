import type { IndexDefinition, SchemaModel } from '../../types';
import { generateId } from '../../utils/id';

export function addIndex(
  schema: SchemaModel,
  name: string,
  entityId: string,
  fieldIds: string[],
  unique: boolean,
): SchemaModel {
  const index: IndexDefinition = {
    id: generateId(),
    name,
    entityId,
    fieldIds,
    unique,
  };
  return {
    ...schema,
    version: schema.version + 1,
    indexes: [...schema.indexes, index],
  };
}

export function deleteIndex(schema: SchemaModel, indexId: string): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    indexes: schema.indexes.filter((idx) => idx.id !== indexId),
  };
}

export function updateIndex(
  schema: SchemaModel,
  indexId: string,
  updates: Partial<Omit<IndexDefinition, 'id'>>,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    indexes: schema.indexes.map((idx) =>
      idx.id === indexId ? { ...idx, ...updates, id: idx.id } : idx,
    ),
  };
}
