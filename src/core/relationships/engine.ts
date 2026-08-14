import type { Entity, Relationship, SchemaModel } from '../../types';
import { addField, addRelationship, getEntity } from '../schema';
import { createField } from '../schema/factory';
import { generateId } from '../../utils/id';
import { junctionEntityName, junctionFieldName } from '../../utils/naming';

export type ManyToManyResult = {
  schema: SchemaModel;
  junctionEntity: Entity;
  relationship: Relationship;
};

/**
 * Creates a junction entity and foreign keys for a many-to-many relationship.
 * Returns the updated schema with the junction table wired in.
 */
export function createManyToManyJunction(
  schema: SchemaModel,
  sourceEntityId: string,
  targetEntityId: string,
  options?: {
    junctionName?: string;
    relationshipName?: string;
  },
): ManyToManyResult {
  const sourceEntity = getEntity(schema, sourceEntityId);
  const targetEntity = getEntity(schema, targetEntityId);

  if (!sourceEntity || !targetEntity) {
    throw new Error('Source or target entity not found');
  }

  const junctionName =
    options?.junctionName ??
    junctionEntityName(sourceEntity.name, targetEntity.name);

  const sourcePk = sourceEntity.fields.find((field) => field.primaryKey);
  const targetPk = targetEntity.fields.find((field) => field.primaryKey);

  if (!sourcePk || !targetPk) {
    throw new Error('Both entities must have a primary key field');
  }

  const sourceFk = createField(junctionFieldName(sourceEntity.name), sourcePk.type, {
    nullable: false,
    optional: false,
    primaryKey: false,
    unique: false,
    references: { entityId: sourceEntityId, fieldId: sourcePk.id },
  });

  const targetFk = createField(junctionFieldName(targetEntity.name), targetPk.type, {
    nullable: false,
    optional: false,
    primaryKey: false,
    unique: false,
    references: { entityId: targetEntityId, fieldId: targetPk.id },
  });

  const junctionEntity: Entity = {
    id: generateId(),
    name: junctionName,
    description: `Junction table linking ${sourceEntity.name} and ${targetEntity.name}`,
    fields: [
      {
        id: generateId(),
        name: 'id',
        type: 'uuid',
        nullable: false,
        optional: false,
        primaryKey: true,
        unique: true,
      },
      sourceFk,
      targetFk,
    ],
  };

  let updatedSchema: SchemaModel = {
    ...schema,
    version: schema.version + 1,
    entities: [...schema.entities, junctionEntity],
  };

  const relationship: Relationship = {
    id: generateId(),
    name: options?.relationshipName,
    sourceEntityId,
    targetEntityId,
    type: 'many-to-many',
    throughEntityId: junctionEntity.id,
    sourceFieldId: sourceFk.id,
    targetFieldId: targetFk.id,
  };

  updatedSchema = {
    ...updatedSchema,
    version: updatedSchema.version + 1,
    relationships: [...updatedSchema.relationships, relationship],
  };

  return {
    schema: updatedSchema,
    junctionEntity,
    relationship,
  };
}

/**
 * Creates a self-referential foreign key field on an entity (e.g. managerId).
 */
export function createSelfRelationship(
  schema: SchemaModel,
  entityId: string,
  fieldName: string,
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' = 'many-to-one',
): SchemaModel {
  const entity = getEntity(schema, entityId);
  if (!entity) {
    throw new Error('Entity not found');
  }

  const pk = entity.fields.find((field) => field.primaryKey);
  if (!pk) {
    throw new Error('Entity must have a primary key');
  }

  const fkField = createField(fieldName, pk.type, {
    nullable: true,
    optional: true,
    references: { entityId, fieldId: pk.id },
  });

  let updatedSchema = addField(schema, entityId, fkField.name, fkField.type, {
    nullable: fkField.nullable,
    optional: fkField.optional,
    references: fkField.references,
  });

  const entityAfterField = getEntity(updatedSchema, entityId);
  const addedField = entityAfterField?.fields.find((field) => field.name === fieldName);

  updatedSchema = addRelationship(updatedSchema, entityId, entityId, type, {
    sourceFieldId: addedField?.id,
    targetFieldId: pk.id,
    name: `${entity.name} self-reference via ${fieldName}`,
  });

  return updatedSchema;
}

export type RelationshipValidationIssue = {
  relationshipId: string;
  message: string;
};

export function detectInvalidRelationships(
  schema: SchemaModel,
): RelationshipValidationIssue[] {
  const issues: RelationshipValidationIssue[] = [];

  for (const relationship of schema.relationships) {
    const source = getEntity(schema, relationship.sourceEntityId);
    const target = getEntity(schema, relationship.targetEntityId);

    if (!source || !target) {
      issues.push({
        relationshipId: relationship.id,
        message: 'Relationship references a missing entity',
      });
      continue;
    }

    if (relationship.type === 'many-to-many' && !relationship.throughEntityId) {
      // Only flag if there's no explicit junction entity in the schema —
      // either by name or by having FK fields to both entities
      const sourceName = source.name.toLowerCase();
      const targetName = target.name.toLowerCase();
      const hasExplicitJunction = schema.entities.some((e) => {
        const n = e.name.toLowerCase();
        if ((n.includes(sourceName) && n.includes(targetName)) ||
            (n.includes(targetName) && n.includes(sourceName))) return true;
        const fkNames = e.fields
          .filter((f) => !f.primaryKey && f.type === 'uuid' && f.name.endsWith('Id'))
          .map((f) => f.name.replace(/Id$/, '').toLowerCase());
        return fkNames.includes(sourceName) && fkNames.includes(targetName);
      });
      if (!hasExplicitJunction) {
        issues.push({
          relationshipId: relationship.id,
          message: 'Many-to-many relationship is missing a junction entity',
        });
      }
    }

    if (relationship.throughEntityId) {
      const junction = getEntity(schema, relationship.throughEntityId);
      if (!junction) {
        issues.push({
          relationshipId: relationship.id,
          message: 'Junction entity referenced by relationship does not exist',
        });
      }
    }

    if (relationship.sourceFieldId) {
      const fieldEntity = relationship.throughEntityId
        ? getEntity(schema, relationship.throughEntityId)
        : source;
      const sourceField = fieldEntity?.fields.find(
        (field) => field.id === relationship.sourceFieldId,
      );
      if (!sourceField) {
        issues.push({
          relationshipId: relationship.id,
          message: 'Source field referenced by relationship does not exist',
        });
      }
    }

    if (relationship.targetFieldId) {
      const fieldEntity = relationship.throughEntityId
        ? getEntity(schema, relationship.throughEntityId)
        : target;
      const targetField = fieldEntity?.fields.find(
        (field) => field.id === relationship.targetFieldId,
      );
      if (!targetField) {
        issues.push({
          relationshipId: relationship.id,
          message: 'Target field referenced by relationship does not exist',
        });
      }
    }

    if (
      relationship.type === 'one-to-one' &&
      relationship.sourceEntityId === relationship.targetEntityId &&
      !relationship.sourceFieldId
    ) {
      issues.push({
        relationshipId: relationship.id,
        message: 'Self one-to-one relationship requires an explicit foreign key field',
      });
    }
  }

  return issues;
}
