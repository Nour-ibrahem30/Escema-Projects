export type ValidationSeverity = 'error' | 'warning' | 'suggestion';

export type ValidationIssueCode =
  | 'duplicate_entity_name'
  | 'duplicate_field_name'
  | 'invalid_data_type'
  | 'missing_primary_key'
  | 'multiple_primary_keys'
  | 'invalid_foreign_key'
  | 'broken_relationship'
  | 'missing_junction_entity'
  | 'circular_dependency'
  | 'invalid_reference'
  | 'naming_conflict'
  | 'orphaned_field'
  | 'duplicate_relationship'
  | 'denormalized_field'
  | 'self_relationship_invalid';

export type ValidationIssue = {
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  message: string;
  entityId?: string;
  fieldId?: string;
  relationshipId?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: ValidationIssue[];
};
