import { describe, expect, it } from 'vitest';
import { addEntity, addRelationship, createEmptySchema } from '../core/schema';
import {
  createManyToManyJunction,
  createSelfRelationship,
  detectInvalidRelationships,
} from '../core/relationships';

describe('Relationship Engine', () => {
  it('creates a junction entity for many-to-many', () => {
    let schema = addEntity(createEmptySchema('School'), 'Student');
    schema = addEntity(schema, 'Course');
    const studentId = schema.entities.find((entity) => entity.name === 'Student')!.id;
    const courseId = schema.entities.find((entity) => entity.name === 'Course')!.id;

    const result = createManyToManyJunction(schema, studentId, courseId);

    expect(result.junctionEntity.name).toBe('StudentCourse');
    expect(result.junctionEntity.fields).toHaveLength(3);
    expect(result.relationship.throughEntityId).toBe(result.junctionEntity.id);
    expect(result.schema.entities).toHaveLength(3);
    expect(result.schema.relationships).toHaveLength(1);
  });

  it('creates a self-referential relationship', () => {
    let schema = addEntity(createEmptySchema('Org'), 'Employee');
    const employeeId = schema.entities[0]!.id;

    schema = createSelfRelationship(schema, employeeId, 'managerId', 'many-to-one');

    const employee = schema.entities.find((entity) => entity.id === employeeId);
    expect(employee?.fields.some((field) => field.name === 'managerId')).toBe(true);
    expect(schema.relationships).toHaveLength(1);
    expect(schema.relationships[0]?.sourceEntityId).toBe(employeeId);
    expect(schema.relationships[0]?.targetEntityId).toBe(employeeId);
  });

  it('detects invalid many-to-many without junction', () => {
    let schema = addEntity(createEmptySchema('Test'), 'A');
    schema = addEntity(schema, 'B');
    schema = addRelationship(schema, schema.entities[0]!.id, schema.entities[1]!.id, 'many-to-many');

    const issues = detectInvalidRelationships(schema);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toContain('junction');
  });

  it('detects broken relationship when entity is missing', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const userId = schema.entities[0]!.id;
    schema = addRelationship(schema, userId, 'non-existent-id', 'one-to-many');

    const issues = detectInvalidRelationships(schema);
    expect(issues.some((issue) => issue.message.includes('missing entity'))).toBe(true);
  });
});

describe('Relationship Engine — Foreign Keys', () => {
  it('junction entity FK fields reference correct entities', () => {
    let schema = addEntity(createEmptySchema('Shop'), 'Product');
    schema = addEntity(schema, 'Category');
    const productId = schema.entities[0]!.id;
    const categoryId = schema.entities[1]!.id;

    const { junctionEntity } = createManyToManyJunction(schema, productId, categoryId);
    const fkFields = junctionEntity.fields.filter((field) => field.references);

    expect(fkFields).toHaveLength(2);
    expect(fkFields.map((field) => field.references?.entityId).sort()).toEqual(
      [categoryId, productId].sort(),
    );
  });
});
