import type { Entity, Field, SchemaModel } from '../../types';
import { generateId } from '../../utils/id';

export function createEmptySchema(
  name: string,
  description?: string,
): SchemaModel {
  return {
    id: generateId(),
    name,
    description,
    version: 1,
    entities: [],
    relationships: [],
    enums: [],
    indexes: [],
    constraints: [],
  };
}

export function createEntity(
  name: string,
  options?: {
    description?: string;
    fields?: Field[];
    position?: Entity['position'];
  },
): Entity {
  const defaultFields: Field[] = options?.fields ?? [
    {
      id: generateId(),
      name: 'id',
      type: 'uuid',
      nullable: false,
      optional: false,
      primaryKey: true,
      unique: true,
    },
  ];

  return {
    id: generateId(),
    name,
    description: options?.description,
    fields: defaultFields,
    position: options?.position,
  };
}

export function createField(
  name: string,
  type: Field['type'],
  options?: Partial<Omit<Field, 'id' | 'name' | 'type'>>,
): Field {
  return {
    id: generateId(),
    name,
    type,
    nullable: options?.nullable ?? true,
    optional: options?.optional ?? false,
    primaryKey: options?.primaryKey ?? false,
    unique: options?.unique ?? false,
    defaultValue: options?.defaultValue,
    references: options?.references,
  };
}

export function cloneSchema(schema: SchemaModel): SchemaModel {
  return structuredClone(schema);
}
