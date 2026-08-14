import type { Entity, SchemaModel } from '../../types';
import { createEntity } from './factory';

export function getEntity(schema: SchemaModel, entityId: string): Entity | undefined {
  return schema.entities.find((entity) => entity.id === entityId);
}

export function findEntityByName(schema: SchemaModel, name: string): Entity | undefined {
  return schema.entities.find(
    (entity) => entity.name.toLowerCase() === name.toLowerCase(),
  );
}

export function addEntity(
  schema: SchemaModel,
  name: string,
  options?: Parameters<typeof createEntity>[1],
): SchemaModel {
  const entity = createEntity(name, options);
  return {
    ...schema,
    version: schema.version + 1,
    entities: [...schema.entities, entity],
  };
}

export function updateEntity(
  schema: SchemaModel,
  entityId: string,
  updates: Partial<Omit<Entity, 'id'>>,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    entities: schema.entities.map((entity) =>
      entity.id === entityId ? { ...entity, ...updates, id: entity.id } : entity,
    ),
  };
}

export function deleteEntity(schema: SchemaModel, entityId: string): SchemaModel {
  const remainingEntities = schema.entities.filter((entity) => entity.id !== entityId);

  const remainingRelationships = schema.relationships.filter(
    (relationship) =>
      relationship.sourceEntityId !== entityId &&
      relationship.targetEntityId !== entityId &&
      relationship.throughEntityId !== entityId,
  );

  const remainingIndexes = schema.indexes.filter(
    (index) => index.entityId !== entityId,
  );

  const remainingConstraints = schema.constraints.filter(
    (constraint) => constraint.entityId !== entityId,
  );

  const cleanedEntities = remainingEntities.map((entity) => ({
    ...entity,
    fields: entity.fields.map((field) =>
      field.references?.entityId === entityId
        ? { ...field, references: undefined }
        : field,
    ),
  }));

  return {
    ...schema,
    version: schema.version + 1,
    entities: cleanedEntities,
    relationships: remainingRelationships,
    indexes: remainingIndexes,
    constraints: remainingConstraints,
  };
}

export function renameEntity(
  schema: SchemaModel,
  entityId: string,
  newName: string,
): SchemaModel {
  return updateEntity(schema, entityId, { name: newName });
}

export function setEntityPosition(
  schema: SchemaModel,
  entityId: string,
  position: Entity['position'],
): SchemaModel {
  return updateEntity(schema, entityId, { position });
}
