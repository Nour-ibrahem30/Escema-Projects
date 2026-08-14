import { useState } from 'react';
import type { SchemaModel } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

type Props = {
  schema: SchemaModel;
};

export function IndexConstraintManager({ schema }: Props) {
  const addIndex = useSchemaStore((s) => s.addIndex);
  const deleteIndex = useSchemaStore((s) => s.deleteIndex);

  const [showForm, setShowForm] = useState(false);
  const [indexName, setIndexName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [isUnique, setIsUnique] = useState(false);

  const selectedEntity = schema.entities.find((e) => e.id === entityId);

  const handleAdd = () => {
    if (!indexName.trim() || !entityId || fieldIds.length === 0) return;
    addIndex(indexName.trim(), entityId, fieldIds, isUnique);
    setIndexName('');
    setEntityId('');
    setFieldIds([]);
    setIsUnique(false);
    setShowForm(false);
  };

  const toggleField = (fid: string) => {
    setFieldIds((prev) =>
      prev.includes(fid) ? prev.filter((id) => id !== fid) : [...prev, fid],
    );
  };

  return (
    <div className="index-manager">
      <div className="inspector-section-header">
        <h3>Indexes</h3>
        <button
          type="button"
          className="btn-icon"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? '✕' : '＋'}
        </button>
      </div>

      {showForm && (
        <div className="index-form">
          <input
            placeholder="Index name"
            value={indexName}
            onChange={(e) => setIndexName(e.target.value)}
          />
          <select
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setFieldIds([]);
            }}
          >
            <option value="">Select entity…</option>
            {schema.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          {selectedEntity && (
            <div className="field-checkbox-list">
              {selectedEntity.fields.map((f) => (
                <label key={f.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={fieldIds.includes(f.id)}
                    onChange={() => toggleField(f.id)}
                  />
                  {f.name}
                </label>
              ))}
            </div>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isUnique}
              onChange={(e) => setIsUnique(e.target.checked)}
            />
            Unique index
          </label>

          <button type="button" className="btn-primary" onClick={handleAdd}>
            Add Index
          </button>
        </div>
      )}

      {schema.indexes.length === 0 && !showForm && (
        <p className="empty">No indexes defined.</p>
      )}

      <ul className="index-list">
        {schema.indexes.map((idx) => {
          const entity = schema.entities.find((e) => e.id === idx.entityId);
          const fieldNames = idx.fieldIds
            .map((fid) => entity?.fields.find((f) => f.id === fid)?.name ?? fid)
            .join(', ');

          return (
            <li key={idx.id} className="index-item">
              <div className="index-item-info">
                <span className="index-name">{idx.name}</span>
                {idx.unique && <span className="badge-mini unique">U</span>}
                <span className="meta">
                  {entity?.name ?? '?'} ({fieldNames})
                </span>
              </div>
              <button
                type="button"
                className="btn-icon danger"
                onClick={() => deleteIndex(idx.id)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
