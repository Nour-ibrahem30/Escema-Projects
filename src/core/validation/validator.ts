import type { SchemaModel, ValidationIssue, ValidationResult } from '../../types';
import { isEnumDataType, isPrimitiveDataType } from '../../types';
import { getEntity } from '../schema';
import { detectInvalidRelationships } from '../relationships';

const DENORMALIZED_PATTERN = /^[\d,\s]+$/;

function issue(
  code: ValidationIssue['code'],
  severity: ValidationIssue['severity'],
  message: string,
  context?: Pick<ValidationIssue, 'entityId' | 'fieldId' | 'relationshipId'>,
): ValidationIssue {
  return { code, severity, message, ...context };
}

function validateEntityNames(schema: SchemaModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();

  for (const entity of schema.entities) {
    const key = entity.name.toLowerCase();
    const existingId = seen.get(key);
    if (existingId) {
      issues.push(
        issue(
          'duplicate_entity_name',
          'error',
          `Duplicate entity name "${entity.name}"`,
          { entityId: entity.id },
        ),
      );
    } else {
      seen.set(key, entity.id);
    }
  }

  return issues;
}

function validateFields(schema: SchemaModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const entity of schema.entities) {
    const fieldNames = new Map<string, string>();

    for (const field of entity.fields) {
      const key = field.name.toLowerCase();
      if (fieldNames.has(key)) {
        issues.push(
          issue(
            'duplicate_field_name',
            'error',
            `Duplicate field name "${field.name}" in entity "${entity.name}"`,
            { entityId: entity.id, fieldId: field.id },
          ),
        );
      } else {
        fieldNames.set(key, field.id);
      }

      if (isEnumDataType(field.type)) {
        const enumId = field.type.enum;
        const enumDef = schema.enums.find((item) => item.id === enumId);
        if (!enumDef) {
          issues.push(
            issue(
              'invalid_data_type',
              'error',
              `Field "${field.name}" references unknown enum "${enumId}"`,
              { entityId: entity.id, fieldId: field.id },
            ),
          );
        }
      } else if (!isPrimitiveDataType(field.type)) {
        issues.push(
          issue(
            'invalid_data_type',
            'error',
            `Field "${field.name}" has invalid data type`,
            { entityId: entity.id, fieldId: field.id },
          ),
        );
      }

      if (field.references) {
        const refEntity = getEntity(schema, field.references.entityId);
        if (!refEntity) {
          issues.push(
            issue(
              'invalid_foreign_key',
              'error',
              `Field "${field.name}" references missing entity`,
              { entityId: entity.id, fieldId: field.id },
            ),
          );
        } else {
          const refField = refEntity.fields.find(
            (item) => item.id === field.references?.fieldId,
          );
          if (!refField) {
            issues.push(
              issue(
                'invalid_reference',
                'error',
                `Field "${field.name}" references missing field on "${refEntity.name}"`,
                { entityId: entity.id, fieldId: field.id },
              ),
            );
          }
        }
      }

      if (
        typeof field.defaultValue === 'string' &&
        DENORMALIZED_PATTERN.test(field.defaultValue) &&
        field.defaultValue.includes(',')
      ) {
        issues.push(
          issue(
            'denormalized_field',
            'suggestion',
            `Field "${field.name}" on "${entity.name}" may store denormalized list data; consider a junction table`,
            { entityId: entity.id, fieldId: field.id },
          ),
        );
      }
    }

    const primaryKeys = entity.fields.filter((field) => field.primaryKey);
    if (primaryKeys.length === 0) {
      issues.push(
        issue(
          'missing_primary_key',
          'error',
          `Entity "${entity.name}" is missing a primary key`,
          { entityId: entity.id },
        ),
      );
    } else if (primaryKeys.length > 1) {
      issues.push(
        issue(
          'multiple_primary_keys',
          'warning',
          `Entity "${entity.name}" has multiple primary key fields`,
          { entityId: entity.id, fieldId: primaryKeys[1]?.id },
        ),
      );
    }
  }

  return issues;
}

function validateRelationships(schema: SchemaModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const relationship of schema.relationships) {
    const signature = [
      relationship.sourceEntityId,
      relationship.targetEntityId,
      relationship.type,
      relationship.throughEntityId ?? '',
    ].join(':');

    if (seen.has(signature)) {
      issues.push(
        issue(
          'duplicate_relationship',
          'warning',
          `Duplicate relationship between entities (${relationship.type})`,
          { relationshipId: relationship.id },
        ),
      );
    } else {
      seen.add(signature);
    }

    const source = getEntity(schema, relationship.sourceEntityId);
    const target = getEntity(schema, relationship.targetEntityId);

    if (!source || !target) {
      issues.push(
        issue(
          'broken_relationship',
          'error',
          'Relationship references one or more missing entities',
          { relationshipId: relationship.id },
        ),
      );
    }

    if (relationship.type === 'many-to-many' && !relationship.throughEntityId) {
      // Accept if the schema has an explicit junction entity that either:
      //  1. Has a name combining both entity names (e.g. StudentCourse), OR
      //  2. Contains FK fields pointing to both source and target entities
      const sourceName = source?.name?.toLowerCase() ?? '';
      const targetName = target?.name?.toLowerCase() ?? '';

      const hasExplicitJunction = schema.entities.some((e) => {
        // Name-based check
        const n = e.name.toLowerCase();
        const nameMatch =
          (n.includes(sourceName) && n.includes(targetName)) ||
          (n.includes(targetName) && n.includes(sourceName));
        if (nameMatch) return true;

        // FK-based check: entity has uuid fields ending with both source and target Id
        const fkNames = e.fields
          .filter((f) => !f.primaryKey && f.type === 'uuid' && f.name.endsWith('Id'))
          .map((f) => f.name.replace(/Id$/, '').toLowerCase());
        return fkNames.includes(sourceName) && fkNames.includes(targetName);
      });

      if (!hasExplicitJunction) {
        issues.push(
          issue(
            'missing_junction_entity',
            'error',
            `Many-to-many relationship between "${source?.name ?? '?'}" and "${target?.name ?? '?'}" requires a junction entity`,
            { relationshipId: relationship.id },
          ),
        );
      }
    }

    if (relationship.throughEntityId) {
      const junction = getEntity(schema, relationship.throughEntityId);
      if (!junction) {
        issues.push(
          issue(
            'missing_junction_entity',
            'error',
            'Relationship references a missing junction entity',
            { relationshipId: relationship.id },
          ),
        );
      }
    }
  }

  for (const invalid of detectInvalidRelationships(schema)) {
    issues.push(
      issue('broken_relationship', 'error', invalid.message, {
        relationshipId: invalid.relationshipId,
      }),
    );
  }

  return issues;
}

function detectCircularDependencies(schema: SchemaModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const graph = new Map<string, Set<string>>();

  for (const entity of schema.entities) {
    graph.set(entity.id, new Set());
  }

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.references?.entityId && field.references.entityId !== entity.id) {
        graph.get(entity.id)?.add(field.references.entityId);
      }
    }
  }

  for (const relationship of schema.relationships) {
    if (relationship.sourceEntityId !== relationship.targetEntityId) {
      graph.get(relationship.sourceEntityId)?.add(relationship.targetEntityId);
    }
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(nodeId: string, path: string[]): boolean {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).map((id) => getEntity(schema, id)?.name ?? id);
      issues.push(
        issue(
          'circular_dependency',
          'warning',
          `Potential circular dependency detected: ${cycle.join(' → ')} → ${getEntity(schema, nodeId)?.name ?? nodeId}`,
        ),
      );
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    stack.add(nodeId);

    for (const neighbor of graph.get(nodeId) ?? []) {
      dfs(neighbor, [...path, nodeId]);
    }

    stack.delete(nodeId);
    return false;
  }

  for (const entityId of graph.keys()) {
    if (!visited.has(entityId)) {
      dfs(entityId, []);
    }
  }

  return issues;
}

function findOrphanedFields(schema: SchemaModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const referencedFieldIds = new Set<string>();

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.references?.fieldId) {
        referencedFieldIds.add(field.references.fieldId);
      }
    }
  }

  for (const relationship of schema.relationships) {
    if (relationship.sourceFieldId) {
      referencedFieldIds.add(relationship.sourceFieldId);
    }
    if (relationship.targetFieldId) {
      referencedFieldIds.add(relationship.targetFieldId);
    }
  }

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (
        field.references &&
        !referencedFieldIds.has(field.id) &&
        !entity.fields.some((other) => other.references?.fieldId === field.id)
      ) {
        const isOnlyFk =
          field.name.endsWith('Id') || field.name.endsWith('_id');
        if (isOnlyFk && !field.primaryKey) {
          issues.push(
            issue(
              'orphaned_field',
              'warning',
              `Foreign key field "${field.name}" on "${entity.name}" is not linked to a relationship`,
              { entityId: entity.id, fieldId: field.id },
            ),
          );
        }
      }
    }
  }

  return issues;
}

export function validateSchema(schema: SchemaModel): ValidationResult {
  const allIssues: ValidationIssue[] = [
    ...validateEntityNames(schema),
    ...validateFields(schema),
    ...validateRelationships(schema),
    ...detectCircularDependencies(schema),
    ...findOrphanedFields(schema),
  ];

  const errors = allIssues.filter((item) => item.severity === 'error');
  const warnings = allIssues.filter((item) => item.severity === 'warning');
  const suggestions = allIssues.filter((item) => item.severity === 'suggestion');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}
