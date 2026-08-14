import type { Relationship, SchemaModel } from '../types';

type SchemaExplorerProps = {
  schema: SchemaModel;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  onSelectEntity: (entityId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
};

export function SchemaExplorer({
  schema,
  selectedEntityId,
  selectedRelationshipId,
  onSelectEntity,
  onSelectRelationship,
}: SchemaExplorerProps) {
  return (
    <aside className="schema-explorer">
      <section>
        <h2>Entities</h2>
        <ul>
          {schema.entities.map((entity) => (
            <li key={entity.id}>
              <button
                type="button"
                className={selectedEntityId === entity.id ? 'selected' : ''}
                onClick={() => onSelectEntity(entity.id)}
              >
                {entity.name}
                <span className="meta">{entity.fields.length} fields</span>
              </button>
            </li>
          ))}
          {schema.entities.length === 0 && (
            <li className="empty">No entities yet</li>
          )}
        </ul>
      </section>

      <section>
        <h2>Relationships</h2>
        <ul>
          {schema.relationships.map((relationship) => (
            <li key={relationship.id}>
              <button
                type="button"
                className={
                  selectedRelationshipId === relationship.id ? 'selected' : ''
                }
                onClick={() => onSelectRelationship(relationship.id)}
              >
                <RelationshipLabel schema={schema} relationship={relationship} />
              </button>
            </li>
          ))}
          {schema.relationships.length === 0 && (
            <li className="empty">No relationships yet</li>
          )}
        </ul>
      </section>

      {schema.enums.length > 0 && (
        <section>
          <h2>Enums</h2>
          <ul>
            {schema.enums.map((enumDef) => (
              <li key={enumDef.id} className="enum-explorer-item">
                <span className="badge-mini enum">E</span>
                {enumDef.name}
                <span className="meta">({enumDef.values.length})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function RelationshipLabel({
  schema,
  relationship,
}: {
  schema: SchemaModel;
  relationship: Relationship;
}) {
  const source = schema.entities.find(
    (entity) => entity.id === relationship.sourceEntityId,
  );
  const target = schema.entities.find(
    (entity) => entity.id === relationship.targetEntityId,
  );

  return (
    <>
      {source?.name ?? '?'} → {target?.name ?? '?'}
      <span className="meta">{relationship.type}</span>
    </>
  );
}
