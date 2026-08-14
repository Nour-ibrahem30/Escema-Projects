import type { Relationship, RelationshipType, SchemaModel } from '../../types';
import { generateId } from '../../utils/id';
import { getEntity } from './entityOps';

export function getRelationship(
  schema: SchemaModel,
  relationshipId: string,
): Relationship | undefined {
  return schema.relationships.find(
    (relationship) => relationship.id === relationshipId,
  );
}

export function addRelationship(
  schema: SchemaModel,
  sourceEntityId: string,
  targetEntityId: string,
  type: RelationshipType,
  options?: Partial<Omit<Relationship, 'id' | 'sourceEntityId' | 'targetEntityId' | 'type'>>,
): SchemaModel {
  const relationship: Relationship = {
    id: generateId(),
    sourceEntityId,
    targetEntityId,
    type,
    ...options,
  };

  return {
    ...schema,
    version: schema.version + 1,
    relationships: [...schema.relationships, relationship],
  };
}

export function updateRelationship(
  schema: SchemaModel,
  relationshipId: string,
  updates: Partial<Omit<Relationship, 'id'>>,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    relationships: schema.relationships.map((relationship) =>
      relationship.id === relationshipId
        ? { ...relationship, ...updates, id: relationship.id }
        : relationship,
    ),
  };
}

export function deleteRelationship(
  schema: SchemaModel,
  relationshipId: string,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    relationships: schema.relationships.filter(
      (relationship) => relationship.id !== relationshipId,
    ),
  };
}

export function findDuplicateRelationship(
  schema: SchemaModel,
  sourceEntityId: string,
  targetEntityId: string,
  type: RelationshipType,
  excludeId?: string,
): Relationship | undefined {
  return schema.relationships.find(
    (relationship) =>
      relationship.id !== excludeId &&
      relationship.sourceEntityId === sourceEntityId &&
      relationship.targetEntityId === targetEntityId &&
      relationship.type === type,
  );
}

export function getEntityRelationships(
  schema: SchemaModel,
  entityId: string,
): Relationship[] {
  return schema.relationships.filter(
    (relationship) =>
      relationship.sourceEntityId === entityId ||
      relationship.targetEntityId === entityId ||
      relationship.throughEntityId === entityId,
  );
}

export function isSelfRelationship(relationship: Relationship): boolean {
  return relationship.sourceEntityId === relationship.targetEntityId;
}

export function relationshipInvolvesEntity(
  relationship: Relationship,
  entityId: string,
): boolean {
  return (
    relationship.sourceEntityId === entityId ||
    relationship.targetEntityId === entityId ||
    relationship.throughEntityId === entityId
  );
}

export function assertEntitiesExist(
  schema: SchemaModel,
  sourceEntityId: string,
  targetEntityId: string,
): boolean {
  return (
    getEntity(schema, sourceEntityId) !== undefined &&
    getEntity(schema, targetEntityId) !== undefined
  );
}
