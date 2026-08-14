import { describe, expect, it } from 'vitest';
import {
  addEntity,
  addField,
  addRelationship,
  createEmptySchema,
  deleteEntity,
  deleteField,
  deleteRelationship,
  getEntity,
  renameEntity,
  updateField,
} from '../core/schema';

describe('Schema Engine — Entity CRUD', () => {
  it('creates an empty schema', () => {
    const schema = createEmptySchema('E-Commerce', 'Online store');
    expect(schema.name).toBe('E-Commerce');
    expect(schema.entities).toHaveLength(0);
    expect(schema.version).toBe(1);
  });

  it('adds an entity with default primary key', () => {
    const schema = createEmptySchema('Test');
    const updated = addEntity(schema, 'User');

    expect(updated.entities).toHaveLength(1);
    expect(updated.entities[0]?.name).toBe('User');
    expect(updated.entities[0]?.fields.some((field) => field.primaryKey)).toBe(true);
    expect(updated.version).toBe(2);
  });

  it('renames an entity', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;
    schema = renameEntity(schema, entityId, 'Customer');

    expect(getEntity(schema, entityId)?.name).toBe('Customer');
  });

  it('deletes an entity and cleans up relationships', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    let schema2 = addEntity(schema, 'Order');
    const userId = schema2.entities[0]!.id;
    const orderId = schema2.entities[1]!.id;

    schema2 = addRelationship(schema2, userId, orderId, 'one-to-many');
    schema2 = deleteEntity(schema2, userId);

    expect(schema2.entities).toHaveLength(1);
    expect(schema2.relationships).toHaveLength(0);
  });
});

describe('Schema Engine — Field CRUD', () => {
  it('adds a field to an entity', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;
    schema = addField(schema, entityId, 'email', 'string', { unique: true });

    const entity = getEntity(schema, entityId);
    expect(entity?.fields).toHaveLength(2);
    expect(entity?.fields.find((field) => field.name === 'email')?.unique).toBe(true);
  });

  it('updates a field', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;
    schema = addField(schema, entityId, 'email', 'string');
    const fieldId = getEntity(schema, entityId)!.fields.find(
      (field) => field.name === 'email',
    )!.id;

    schema = updateField(schema, entityId, fieldId, { unique: true });
    expect(
      getEntity(schema, entityId)?.fields.find((field) => field.id === fieldId)?.unique,
    ).toBe(true);
  });

  it('deletes a field', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    const entityId = schema.entities[0]!.id;
    schema = addField(schema, entityId, 'email', 'string');
    const fieldId = getEntity(schema, entityId)!.fields.find(
      (field) => field.name === 'email',
    )!.id;

    schema = deleteField(schema, entityId, fieldId);
    expect(getEntity(schema, entityId)?.fields).toHaveLength(1);
  });
});

describe('Schema Engine — Relationship CRUD', () => {
  it('adds a one-to-many relationship', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    schema = addEntity(schema, 'Order');
    const userId = schema.entities[0]!.id;
    const orderId = schema.entities[1]!.id;

    schema = addRelationship(schema, userId, orderId, 'one-to-many');
    expect(schema.relationships).toHaveLength(1);
    expect(schema.relationships[0]?.type).toBe('one-to-many');
  });

  it('deletes a relationship', () => {
    let schema = addEntity(createEmptySchema('Test'), 'User');
    schema = addEntity(schema, 'Order');
    const userId = schema.entities[0]!.id;
    const orderId = schema.entities[1]!.id;
    schema = addRelationship(schema, userId, orderId, 'one-to-many');
    const relationshipId = schema.relationships[0]!.id;

    schema = deleteRelationship(schema, relationshipId);
    expect(schema.relationships).toHaveLength(0);
  });
});
