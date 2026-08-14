import { describe, expect, it } from 'vitest';
import {
  addEntity,
  addField,
  addRelationship,
  createEmptySchema,
} from '../core/schema';
import { createManyToManyJunction } from '../core/relationships';
import { validateSchema } from '../core/validation';

describe('Validation Engine', () => {
  it('returns valid for a well-formed schema', () => {
    let schema = addEntity(createEmptySchema('E-Commerce'), 'User');
    schema = addEntity(schema, 'Product');
    schema = addField(schema, schema.entities[0]!.id, 'email', 'string', { unique: true });

    const result = validateSchema(schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate entity names', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    schema = addEntity(schema, 'user');

    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'duplicate_entity_name')).toBe(true);
  });

  it('detects duplicate field names within an entity', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;
    schema = addField(schema, entityId, 'email', 'string');
    schema = addField(schema, entityId, 'Email', 'string');

    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'duplicate_field_name')).toBe(true);
  });

  it('detects missing primary key', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;
    schema = addField(schema, entityId, 'name', 'string');

    schema = {
      ...schema,
      entities: schema.entities.map((item) =>
        item.id === entityId
          ? {
              ...item,
              fields: item.fields.map((field) => ({ ...field, primaryKey: false })),
            }
          : item,
      ),
    };

    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'missing_primary_key')).toBe(true);
  });

  it('detects missing junction entity for many-to-many', () => {
    let schema = addEntity(createEmptySchema('Test'), 'Student');
    schema = addEntity(schema, 'Course');
    schema = addRelationship(
      schema,
      schema.entities[0]!.id,
      schema.entities[1]!.id,
      'many-to-many',
    );

    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) => issue.code === 'missing_junction_entity'),
    ).toBe(true);
  });

  it('passes validation after junction entity is created', () => {
    let schema = addEntity(createEmptySchema('Test'), 'Student');
    schema = addEntity(schema, 'Course');
    const studentId = schema.entities[0]!.id;
    const courseId = schema.entities[1]!.id;

    const { schema: withJunction } = createManyToManyJunction(schema, studentId, courseId);
    const result = validateSchema(withJunction);

    expect(result.valid).toBe(true);
  });

  it('detects invalid foreign key references', () => {
    let schema = addEntity(createEmptySchema('Test'), 'Order');
    const entityId = schema.entities[0]!.id;

    schema = addField(schema, entityId, 'userId', 'uuid', {
      references: { entityId: 'missing-entity', fieldId: 'missing-field' },
    });

    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'invalid_foreign_key')).toBe(true);
  });

  it('suggests denormalized list fields', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;

    schema = addField(schema, entityId, 'productIds', 'string', {
      defaultValue: '1,2,5,9',
    });

    const result = validateSchema(schema);
    expect(result.suggestions.some((issue) => issue.code === 'denormalized_field')).toBe(
      true,
    );
  });
});
