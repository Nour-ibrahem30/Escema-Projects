import type { EnumDefinition, SchemaModel } from '../../types';
import { generateId } from '../../utils/id';

export function addEnum(schema: SchemaModel, name: string): SchemaModel {
  const enumDef: EnumDefinition = {
    id: generateId(),
    name,
    values: [],
  };
  return {
    ...schema,
    version: schema.version + 1,
    enums: [...schema.enums, enumDef],
  };
}

export function renameEnum(
  schema: SchemaModel,
  enumId: string,
  newName: string,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    enums: schema.enums.map((e) =>
      e.id === enumId ? { ...e, name: newName } : e,
    ),
  };
}

export function deleteEnum(schema: SchemaModel, enumId: string): SchemaModel {
  // Clean fields that reference this enum
  const cleanedEntities = schema.entities.map((entity) => ({
    ...entity,
    fields: entity.fields.map((field) => {
      if (typeof field.type === 'object' && field.type.enum === enumId) {
        return { ...field, type: 'string' as const };
      }
      return field;
    }),
  }));

  return {
    ...schema,
    version: schema.version + 1,
    enums: schema.enums.filter((e) => e.id !== enumId),
    entities: cleanedEntities,
  };
}

export function addEnumValue(
  schema: SchemaModel,
  enumId: string,
  value: string,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    enums: schema.enums.map((e) =>
      e.id === enumId && !e.values.includes(value)
        ? { ...e, values: [...e.values, value] }
        : e,
    ),
  };
}

export function removeEnumValue(
  schema: SchemaModel,
  enumId: string,
  value: string,
): SchemaModel {
  return {
    ...schema,
    version: schema.version + 1,
    enums: schema.enums.map((e) =>
      e.id === enumId
        ? { ...e, values: e.values.filter((v) => v !== value) }
        : e,
    ),
  };
}
