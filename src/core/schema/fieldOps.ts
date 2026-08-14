import type { Field, SchemaModel } from '../../types';
import { createField } from './factory';
import { getEntity } from './entityOps';

export function getField(
  schema: SchemaModel,
  entityId: string,
  fieldId: string,
): Field | undefined {
  const entity = getEntity(schema, entityId);
  return entity?.fields.find((field) => field.id === fieldId);
}

export function addField(
  schema: SchemaModel,
  entityId: string,
  name: string,
  type: Field['type'],
  options?: Partial<Omit<Field, 'id' | 'name' | 'type'>>,
): SchemaModel {
  const field = createField(name, type, options);

  return {
    ...schema,
    version: schema.version + 1,
    entities: schema.entities.map((entity) =>
      entity.id === entityId
        ? { ...entity, fields: [...entity.fields, field] }
        : entity,
    ),
  };
}

export function updateField(
  schema: SchemaModel,
  entityId: string,
  fieldId: string,
  updates: Partial<Omit<Field, 'id'>>,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    entities: schema.entities.map((entity) =>
      entity.id === entityId
        ? {
            ...entity,
            fields: entity.fields.map((field) =>
              field.id === fieldId ? { ...field, ...updates, id: field.id } : field,
            ),
          }
        : entity,
    ),
  };
}

export function deleteField(
  schema: SchemaModel,
  entityId: string,
  fieldId: string,
): SchemaModel {
  const cleanedRelationships = schema.relationships.filter(
    (relationship) =>
      relationship.sourceFieldId !== fieldId &&
      relationship.targetFieldId !== fieldId,
  );

  const cleanedEntities = schema.entities.map((entity) => ({
    ...entity,
    fields: entity.fields.map((field) =>
      field.references?.fieldId === fieldId
        ? { ...field, references: undefined }
        : field,
    ),
  }));

  return {
    ...schema,
    version: schema.version + 1,
    entities: cleanedEntities.map((entity) =>
      entity.id === entityId
        ? {
            ...entity,
            fields: entity.fields.filter((field) => field.id !== fieldId),
          }
        : entity,
    ),
    relationships: cleanedRelationships,
  };
}
