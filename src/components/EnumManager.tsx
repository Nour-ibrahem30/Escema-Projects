import { useState } from 'react';
import type { EnumDefinition } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

export function EnumManager() {
  const schema = useSchemaStore((s) => s.schema);
  const addEnum = useSchemaStore((s) => s.addEnum);
  const deleteEnum = useSchemaStore((s) => s.deleteEnum);
  const addEnumValue = useSchemaStore((s) => s.addEnumValue);
  const removeEnumValue = useSchemaStore((s) => s.removeEnumValue);
  const renameEnum = useSchemaStore((s) => s.renameEnum);

  const [showForm, setShowForm] = useState(false);
  const [newEnumName, setNewEnumName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAddEnum = () => {
    if (!newEnumName.trim()) return;
    addEnum(newEnumName.trim());
    setNewEnumName('');
    setShowForm(false);
  };

  return (
    <div className="enum-manager">
      <div className="inspector-section-header">
        <h3>Enums</h3>
        <button
          type="button"
          className="btn-icon"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? '✕' : '＋'}
        </button>
      </div>

      {showForm && (
        <div className="add-field-form">
          <input
            autoFocus
            placeholder="Enum name (e.g. Status)"
            value={newEnumName}
            onChange={(e) => setNewEnumName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEnum()}
          />
          <button type="button" className="btn-primary" onClick={handleAddEnum}>
            Add
          </button>
        </div>
      )}

      {schema.enums.length === 0 && !showForm && (
        <p className="empty">No enums defined.</p>
      )}

      <ul className="enum-list">
        {schema.enums.map((enumDef) => (
          <EnumItem
            key={enumDef.id}
            enumDef={enumDef}
            expanded={expandedId === enumDef.id}
            onToggle={() =>
              setExpandedId((id) => (id === enumDef.id ? null : enumDef.id))
            }
            onDelete={() => deleteEnum(enumDef.id)}
            onAddValue={(val) => addEnumValue(enumDef.id, val)}
            onRemoveValue={(val) => removeEnumValue(enumDef.id, val)}
            onRename={(name) => renameEnum(enumDef.id, name)}
          />
        ))}
      </ul>
    </div>
  );
}

type EnumItemProps = {
  enumDef: EnumDefinition;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddValue: (value: string) => void;
  onRemoveValue: (value: string) => void;
  onRename: (name: string) => void;
};

function EnumItem({
  enumDef,
  expanded,
  onToggle,
  onDelete,
  onAddValue,
  onRemoveValue,
  onRename,
}: EnumItemProps) {
  const [newValue, setNewValue] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(enumDef.name);

  const handleAddValue = () => {
    if (!newValue.trim()) return;
    onAddValue(newValue.trim().toUpperCase());
    setNewValue('');
  };

  const handleRename = () => {
    if (nameVal.trim() && nameVal.trim() !== enumDef.name) {
      onRename(nameVal.trim());
    }
    setEditingName(false);
  };

  return (
    <li className="enum-item">
      <div className="enum-item-header">
        {editingName ? (
          <input
            className="field-inline-input"
            value={nameVal}
            autoFocus
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setNameVal(enumDef.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="enum-name-btn"
            onClick={onToggle}
          >
            <span className="badge-mini enum">E</span>
            {enumDef.name}
            <span className="meta">({enumDef.values.length})</span>
          </button>
        )}
        <div className="enum-actions">
          <button
            type="button"
            className="btn-icon"
            title="Rename"
            onClick={() => {
              setNameVal(enumDef.name);
              setEditingName(true);
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className="btn-icon danger"
            title="Delete enum"
            onClick={onDelete}
          >
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div className="enum-values">
          <ul>
            {enumDef.values.map((val) => (
              <li key={val} className="enum-value-row">
                <span>{val}</span>
                <button
                  type="button"
                  className="btn-icon danger small"
                  onClick={() => onRemoveValue(val)}
                >
                  ✕
                </button>
              </li>
            ))}
            {enumDef.values.length === 0 && (
              <li className="empty">No values yet</li>
            )}
          </ul>
          <div className="add-field-form">
            <input
              placeholder="VALUE"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddValue()}
            />
            <button type="button" className="btn-primary" onClick={handleAddValue}>
              Add
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
