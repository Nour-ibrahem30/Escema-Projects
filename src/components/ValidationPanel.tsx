import type { ValidationIssue, ValidationResult } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

// ─── Auto-fix logic ───────────────────────────────────────────────────────────

function useAutoFix() {
  const store = useSchemaStore();

  return (issue: ValidationIssue): (() => void) | null => {
    const { schema } = store;

    switch (issue.code) {

      // ── Add missing primary key (uuid id field) ──────────────────────────
      case 'missing_primary_key': {
        if (!issue.entityId) return null;
        const entityId = issue.entityId;
        return () => {
          store.addField(entityId, 'id', 'uuid', {
            primaryKey: true,
            unique: true,
            nullable: false,
            optional: false,
          });
        };
      }

      // ── Remove the extra primary key (keep only the first) ───────────────
      case 'multiple_primary_keys': {
        if (!issue.entityId || !issue.fieldId) return null;
        const { entityId, fieldId } = issue;
        return () => store.updateField(entityId, fieldId, { primaryKey: false });
      }

      // ── Delete broken / duplicate relationship ───────────────────────────
      case 'broken_relationship':
      case 'duplicate_relationship': {
        if (!issue.relationshipId) return null;
        const relId = issue.relationshipId;
        return () => store.deleteRelationship(relId);
      }

      // ── Create junction entity for many-to-many ──────────────────────────
      case 'missing_junction_entity': {
        if (!issue.relationshipId) return null;
        const rel = schema.relationships.find((r) => r.id === issue.relationshipId);
        if (!rel) return null;
        const sourceId = rel.sourceEntityId;
        const targetId = rel.targetEntityId;
        return () => store.addManyToManyRelationship(sourceId, targetId);
      }

      // ── Clear broken foreign-key reference from field ────────────────────
      case 'invalid_foreign_key':
      case 'invalid_reference': {
        if (!issue.entityId || !issue.fieldId) return null;
        const { entityId, fieldId } = issue;
        return () => store.updateField(entityId, fieldId, { references: undefined });
      }

      // ── Remove orphaned FK field ─────────────────────────────────────────
      case 'orphaned_field': {
        if (!issue.entityId || !issue.fieldId) return null;
        const { entityId, fieldId } = issue;
        return () => store.deleteField(entityId, fieldId);
      }

      // ── Fix invalid data type → default to 'string' ──────────────────────
      case 'invalid_data_type': {
        if (!issue.entityId || !issue.fieldId) return null;
        const { entityId, fieldId } = issue;
        return () => store.updateField(entityId, fieldId, { type: 'string' });
      }

      // ── Rename duplicate entity (append _2) ──────────────────────────────
      case 'duplicate_entity_name': {
        if (!issue.entityId) return null;
        const entity = schema.entities.find((e) => e.id === issue.entityId);
        if (!entity) return null;
        const entityId = issue.entityId;
        const newName  = `${entity.name}_2`;
        return () => store.renameEntity(entityId, newName);
      }

      // ── Rename duplicate field (append _2) ───────────────────────────────
      case 'duplicate_field_name': {
        if (!issue.entityId || !issue.fieldId) return null;
        const entity = schema.entities.find((e) => e.id === issue.entityId);
        const field  = entity?.fields.find((f) => f.id === issue.fieldId);
        if (!entity || !field) return null;
        const entityId = issue.entityId;
        const fieldId  = issue.fieldId;
        const newName  = `${field.name}_2`;
        return () => store.updateField(entityId, fieldId, { name: newName });
      }

      // ── No auto-fix available ────────────────────────────────────────────
      default:
        return null;
    }
  };
}

// ─── Fix label per issue code ─────────────────────────────────────────────────

const FIX_LABEL: Partial<Record<ValidationIssue['code'], string>> = {
  missing_primary_key:    'Add id field',
  multiple_primary_keys:  'Remove extra PK',
  broken_relationship:    'Delete relationship',
  duplicate_relationship: 'Delete duplicate',
  missing_junction_entity:'Create junction',
  invalid_foreign_key:    'Clear reference',
  invalid_reference:      'Clear reference',
  orphaned_field:         'Remove field',
  invalid_data_type:      'Set to string',
  duplicate_entity_name:  'Rename to _2',
  duplicate_field_name:   'Rename to _2',
};

// ─── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const getFixHandler = useAutoFix();
  const fix = getFixHandler(issue);

  const cls =
    issue.severity === 'error'      ? 'validation-issue error'
    : issue.severity === 'warning'  ? 'validation-issue warning'
    :                                  'validation-issue suggestion';

  const icon =
    issue.severity === 'error'     ? '✕'
    : issue.severity === 'warning' ? '⚠'
    :                                 '💡';

  return (
    <div className={cls}>
      <span className="issue-icon">{icon}</span>
      <div className="issue-body">
        <span className="issue-code">{issue.code}</span>
        <span className="issue-msg">{issue.message}</span>
      </div>
      {fix && (
        <button
          type="button"
          className="issue-fix-btn"
          onClick={fix}
          title={`Auto-fix: ${FIX_LABEL[issue.code] ?? 'Fix'}`}
        >
          ⚡ {FIX_LABEL[issue.code] ?? 'Fix'}
        </button>
      )}
    </div>
  );
}

// ─── ValidationPanel ──────────────────────────────────────────────────────────

type Props = {
  validation: ValidationResult;
};

export function ValidationPanel({ validation }: Props) {
  const total =
    validation.errors.length +
    validation.warnings.length +
    validation.suggestions.length;

  // ── Fix-all: applies every auto-fixable issue in one click ──
  const getFixHandler = useAutoFix();
  const allFixable = [
    ...validation.errors,
    ...validation.warnings,
    ...validation.suggestions,
  ].filter((issue) => getFixHandler(issue) !== null);

  const handleFixAll = () => {
    // Run fixes in reverse so deletes don't invalidate later indices
    [...allFixable].reverse().forEach((issue) => {
      const fix = getFixHandler(issue);
      fix?.();
    });
  };

  if (total === 0) {
    return (
      <div className="validation-panel">
        <p className="validation-ok">✓ No issues found</p>
      </div>
    );
  }

  return (
    <div className="validation-panel">
      <div className="inspector-section-header" style={{ marginTop: '0.75rem' }}>
        <h3>Validation</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="meta">{total} issue{total !== 1 ? 's' : ''}</span>
          {allFixable.length > 0 && (
            <button
              type="button"
              className="fix-all-btn"
              onClick={handleFixAll}
              title={`Auto-fix all ${allFixable.length} fixable issues`}
            >
              ⚡ Fix all ({allFixable.length})
            </button>
          )}
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="validation-group">
          <span className="validation-group-label">Errors</span>
          {validation.errors.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="validation-group">
          <span className="validation-group-label">Warnings</span>
          {validation.warnings.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      )}

      {validation.suggestions.length > 0 && (
        <div className="validation-group">
          <span className="validation-group-label">Suggestions</span>
          {validation.suggestions.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}
