import { useState } from 'react';
import type { Entity, Field } from '../types';
import { PRIMITIVE_DATA_TYPES } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

type Props = {
  entity: Entity | null;
};

export function EntityInspector({ entity }: Props) {
  if (!entity) {
    return (
      <div className="inspector-empty">
        <p>Select an entity to inspect its fields.</p>
      </div>
    );
  }
  return <EntityInspectorContent entity={entity} />;
}

function EntityInspectorContent({ entity }: { entity: Entity }) {
  const addField = useSchemaStore((s) => s.addField);
  const updateField = useSchemaStore((s) => s.updateField);
  const deleteField = useSchemaStore((s) => s.deleteField);
  const renameEntity = useSchemaStore((s) => s.renameEntity);
  const updateEntity = useSchemaStore((s) => s.updateEntity);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(entity.name);
  const [descValue, setDescValue] = useState(entity.description ?? '');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  // New field form state
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<Field['type']>('string');
  const [newFieldNullable, setNewFieldNullable] = useState(true);
  const [newFieldUnique, setNewFieldUnique] = useState(false);

  const handleRenameSubmit = () => {
    if (nameValue.trim() && nameValue.trim() !== entity.name) {
      renameEntity(entity.id, nameValue.trim());
    }
    setEditingName(false);
  };

  const handleDescBlur = () => {
    if (descValue !== (entity.description ?? '')) {
      updateEntity(entity.id, { description: descValue || undefined });
    }
  };

  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    addField(entity.id, newFieldName.trim(), newFieldType, {
      nullable: newFieldNullable,
      unique: newFieldUnique,
    });
    setNewFieldName('');
    setNewFieldType('string');
    setNewFieldNullable(true);
    setNewFieldUnique(false);
    setShowAddField(false);
  };

  const handleDeleteField = (fieldId: string) => {
    const field = entity.fields.find((f) => f.id === fieldId);
    if (field?.primaryKey) return; // protect PK
    deleteField(entity.id, fieldId);
  };

  return (
    <div className="entity-inspector">
      {/* Entity name */}
      <div className="inspector-header">
        {editingName ? (
          <input
            className="inspector-name-input"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') {
                setNameValue(entity.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="inspector-name-btn"
            title="Click to rename"
            onClick={() => {
              setNameValue(entity.name);
              setEditingName(true);
            }}
          >
            {entity.name}
            <span className="edit-hint">✎</span>
          </button>
        )}
      </div>

      {/* Description */}
      <input
        className="inspector-desc-input"
        placeholder="Add description…"
        value={descValue}
        onChange={(e) => setDescValue(e.target.value)}
        onBlur={handleDescBlur}
      />

      {/* Fields table */}
      <div className="inspector-section">
        <div className="inspector-section-header">
          <h3>Fields</h3>
          <button
            type="button"
            className="btn-icon"
            title="Add field"
            onClick={() => setShowAddField((v) => !v)}
          >
            {showAddField ? '✕' : '＋'}
          </button>
        </div>

        {showAddField && (
          <div className="add-field-form">
            <input
              placeholder="Field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
              autoFocus
            />
            <select
              value={typeof newFieldType === 'string' ? newFieldType : ''}
              onChange={(e) => setNewFieldType(e.target.value as Field['type'])}
            >
              {PRIMITIVE_DATA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newFieldNullable}
                onChange={(e) => setNewFieldNullable(e.target.checked)}
              />
              nullable
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newFieldUnique}
                onChange={(e) => setNewFieldUnique(e.target.checked)}
              />
              unique
            </label>
            <button type="button" className="btn-primary" onClick={handleAddField}>
              Add
            </button>
          </div>
        )}

        <table className="fields-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Flags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entity.fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                entityId={entity.id}
                isEditing={editingFieldId === field.id}
                onStartEdit={() => setEditingFieldId(field.id)}
                onStopEdit={() => setEditingFieldId(null)}
                onUpdate={(updates) => {
                  updateField(entity.id, field.id, updates);
                  setEditingFieldId(null);
                }}
                onDelete={() => handleDeleteField(field.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FieldRow ──────────────────────────────────────────────────────────────────

type FieldRowProps = {
  field: Field;
  entityId: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (updates: Partial<Omit<Field, 'id'>>) => void;
  onDelete: () => void;
};

function FieldRow({
  field,
  isEditing,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onDelete,
}: FieldRowProps) {
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<Field['type']>(field.type);
  const [nullable, setNullable] = useState(field.nullable);
  const [unique, setUnique] = useState(field.unique);

  const handleSave = () => {
    onUpdate({ name, type, nullable, unique });
  };

  const formatType = (t: Field['type']) =>
    typeof t === 'object' ? `enum(${t.enum})` : t;

  if (isEditing) {
    return (
      <tr className="field-row editing">
        <td>
          <input
            className="field-inline-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onStopEdit();
            }}
          />
        </td>
        <td>
          <select
            className="field-inline-select"
            value={typeof type === 'string' ? type : ''}
            onChange={(e) => setType(e.target.value as Field['type'])}
          >
            {PRIMITIVE_DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </td>
        <td>
          <label className="checkbox-label small">
            <input
              type="checkbox"
              checked={nullable}
              onChange={(e) => setNullable(e.target.checked)}
            />
            null
          </label>
          <label className="checkbox-label small">
            <input
              type="checkbox"
              checked={unique}
              onChange={(e) => setUnique(e.target.checked)}
            />
            uniq
          </label>
        </td>
        <td>
          <button type="button" className="btn-icon save" onClick={handleSave}>
            ✓
          </button>
          <button type="button" className="btn-icon cancel" onClick={onStopEdit}>
            ✕
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="field-row">
      <td>{field.name}</td>
      <td className="field-type-cell">{formatType(field.type)}</td>
      <td>
        {field.primaryKey && <span className="badge pk">PK</span>}
        {field.unique && <span className="badge unique">U</span>}
        {field.references && <span className="badge fk">FK</span>}
        {field.nullable && <span className="badge nullable">?</span>}
      </td>
      <td>
        <button
          type="button"
          className="btn-icon"
          title="Edit field"
          onClick={onStartEdit}
        >
          ✎
        </button>
        {!field.primaryKey && (
          <button
            type="button"
            className="btn-icon danger"
            title="Delete field"
            onClick={onDelete}
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}
