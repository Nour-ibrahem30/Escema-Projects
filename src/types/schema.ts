/** Primitive column types supported by the Schema IR. */
export type PrimitiveDataType =
  | 'string'
  | 'text'
  | 'integer'
  | 'float'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'json';

/** Data type — either a primitive or a reference to an enum definition. */
export type DataType = PrimitiveDataType | { enum: string };

export type FieldReference = {
  entityId: string;
  fieldId: string;
};

export type Field = {
  id: string;
  name: string;
  type: DataType;
  nullable: boolean;
  optional: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: unknown;
  references?: FieldReference;
};

export type EntityPosition = {
  x: number;
  y: number;
};

export type Entity = {
  id: string;
  name: string;
  description?: string;
  fields: Field[];
  position?: EntityPosition;
};

export type RelationshipType =
  | 'one-to-one'
  | 'one-to-many'
  | 'many-to-one'
  | 'many-to-many';

export type Relationship = {
  id: string;
  name?: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  sourceFieldId?: string;
  targetFieldId?: string;
  throughEntityId?: string;
};

export type EnumDefinition = {
  id: string;
  name: string;
  values: string[];
};

export type IndexDefinition = {
  id: string;
  name: string;
  entityId: string;
  fieldIds: string[];
  unique: boolean;
};

export type ConstraintKind =
  | 'unique'
  | 'check'
  | 'foreign_key'
  | 'primary_key';

export type Constraint = {
  id: string;
  name?: string;
  kind: ConstraintKind;
  entityId: string;
  fieldIds: string[];
  expression?: string;
};

/** Canonical Schema IR — single source of truth for the entire application. */
export type SchemaModel = {
  id: string;
  name: string;
  description?: string;
  version: number;
  entities: Entity[];
  relationships: Relationship[];
  enums: EnumDefinition[];
  indexes: IndexDefinition[];
  constraints: Constraint[];
};

export const PRIMITIVE_DATA_TYPES: readonly PrimitiveDataType[] = [
  'string',
  'text',
  'integer',
  'float',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'uuid',
  'json',
] as const;

export function isPrimitiveDataType(value: string): value is PrimitiveDataType {
  return (PRIMITIVE_DATA_TYPES as readonly string[]).includes(value);
}

export function isEnumDataType(
  type: DataType,
): type is { enum: string } {
  return typeof type === 'object' && type !== null && 'enum' in type;
}
