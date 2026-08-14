import { useState } from 'react';
import type { Relationship, RelationshipType, SchemaModel } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

type Props = {
  relationship: Relationship | null;
  schema: SchemaModel;
};

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
];

export function RelationshipInspector({ relationship, schema }: Props) {
  if (!relationship) {
    return (
      <div className="inspector-empty">
        <p>Select a relationship to inspect it.</p>
      </div>
    );
  }
  return <RelationshipInspectorContent relationship={relationship} schema={schema} />;
}

function RelationshipInspectorContent({
  relationship,
  schema,
}: {
  relationship: Relationship;
  schema: SchemaModel;
}) {
  const updateRelationship = useSchemaStore((s) => s.updateRelationship);
  const deleteRelationship = useSchemaStore((s) => s.deleteRelationship);

  const [name, setName] = useState(relationship.name ?? '');
  const [type, setType] = useState<RelationshipType>(relationship.type);

  const source = schema.entities.find((e) => e.id === relationship.sourceEntityId);
  const target = schema.entities.find((e) => e.id === relationship.targetEntityId);
  const through = relationship.throughEntityId
    ? schema.entities.find((e) => e.id === relationship.throughEntityId)
    : null;

  const handleSave = () => {
    updateRelationship(relationship.id, {
      name: name.trim() || undefined,
      type,
    });
  };

  return (
    <div className="relationship-inspector">
      <div className="inspector-section-header">
        <h3>Relationship</h3>
        <button
          type="button"
          className="btn-icon danger"
          title="Delete relationship"
          onClick={() => deleteRelationship(relationship.id)}
        >
          ✕
        </button>
      </div>

      <div className="rel-entities">
        <span className="rel-entity-name">{source?.name ?? '?'}</span>
        <span className="rel-arrow">→</span>
        <span className="rel-entity-name">{target?.name ?? '?'}</span>
      </div>

      {through && (
        <div className="rel-through">
          <span className="meta">via</span>
          <span className="rel-entity-name">{through.name}</span>
        </div>
      )}

      <div className="inspector-form">
        <label className="form-label">
          Name (optional)
          <input
            className="form-input"
            placeholder="e.g. has_orders"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="form-label">
          Type
          <select
            className="form-select"
            value={type}
            onChange={(e) => setType(e.target.value as RelationshipType)}
          >
            {RELATIONSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <button type="button" className="btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      <div className="rel-meta-grid">
        <span className="meta">Source ID</span>
        <code className="id-code">{relationship.sourceEntityId.slice(0, 8)}…</code>
        <span className="meta">Target ID</span>
        <code className="id-code">{relationship.targetEntityId.slice(0, 8)}…</code>
        {relationship.throughEntityId && (
          <>
            <span className="meta">Junction ID</span>
            <code className="id-code">{relationship.throughEntityId.slice(0, 8)}…</code>
          </>
        )}
      </div>
    </div>
  );
}
