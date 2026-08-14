import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Entity } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

// ─── Entity Node ──────────────────────────────────────────────────────────────

type EntityNodeData = {
  entity: Entity;
  isSelected: boolean;
};

function EntityNode({ data }: { data: EntityNodeData }) {
  const { entity, isSelected } = data;

  return (
    <div className={`diagram-entity-node${isSelected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />

      <div className="entity-node-header">
        <span className="entity-node-name">{entity.name}</span>
        {entity.description && (
          <span className="entity-node-desc">{entity.description}</span>
        )}
      </div>

      <div className="entity-node-fields">
        {entity.fields.map((field) => (
          <div key={field.id} className="entity-node-field">
            <span className="field-flags">
              {field.primaryKey && <span className="badge-mini pk">PK</span>}
              {field.unique && !field.primaryKey && (
                <span className="badge-mini unique">U</span>
              )}
              {field.references && <span className="badge-mini fk">FK</span>}
            </span>
            <span className="field-name">{field.name}</span>
            <span className="field-type">
              {typeof field.type === 'object'
                ? `enum(${field.type.enum})`
                : field.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode };

// ─── Relationship label map ───────────────────────────────────────────────────

const REL_LABEL: Record<string, string> = {
  'one-to-one': '1 : 1',
  'one-to-many': '1 : N',
  'many-to-one': 'N : 1',
  'many-to-many': 'N : M',
};

// ─── DiagramCanvas ────────────────────────────────────────────────────────────

export function DiagramCanvas() {
  const schema = useSchemaStore((s) => s.schema);
  const selectedEntityId = useSchemaStore((s) => s.selectedEntityId);
  const selectEntity = useSchemaStore((s) => s.selectEntity);
  const selectRelationship = useSchemaStore((s) => s.selectRelationship);
  const setEntityPosition = useSchemaStore((s) => s.setEntityPosition);
  const addRelationship = useSchemaStore((s) => s.addRelationship);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Track last schema id+version to detect when a completely new schema loads
  const schemaKeyRef = useRef('');

  useEffect(() => {
    const schemaKey = `${schema.id}:${schema.version}`;
    schemaKeyRef.current = schemaKey;

    // Build nodes
    const newNodes: Node[] = schema.entities.map((entity, index) => ({
      id: entity.id,
      type: 'entity',
      position: entity.position ?? {
        x: 80 + (index % 3) * 340,
        y: 80 + Math.floor(index / 3) * 280,
      },
      data: {
        entity,
        isSelected: selectedEntityId === entity.id,
      },
    }));

    // Build edges
    const newEdges: Edge[] = schema.relationships.map((rel) => ({
      id: rel.id,
      source: rel.sourceEntityId,
      target: rel.targetEntityId,
      label: REL_LABEL[rel.type] ?? rel.type,
      type: rel.type === 'many-to-many' ? 'smoothstep' : 'default',
      animated: rel.type === 'many-to-many',
      style: { stroke: '#475569', strokeWidth: 1.5 },
      labelStyle: { fill: '#94a3b8', fontSize: 11 },
      labelBgStyle: { fill: '#1e293b' },
      markerEnd: { type: 'arrowclosed' as const, color: '#475569' },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);   // re-run on every schema change

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addRelationship(connection.source, connection.target, 'one-to-many');
      }
      setEdges((eds) => addEdge(connection, eds));
    },
    [addRelationship, setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => selectEntity(node.id),
    [selectEntity],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => selectRelationship(edge.id),
    [selectRelationship],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) =>
      setEntityPosition(node.id, node.position.x, node.position.y),
    [setEntityPosition],
  );

  const onPaneClick = useCallback(() => selectEntity(null), [selectEntity]);

  if (schema.entities.length === 0) {
    return (
      <div className="diagram-empty">
        <div className="placeholder-content">
          <h2>Diagram Canvas</h2>
          <p>Add entities or use the AI bar below to generate a schema.</p>
          <p className="hint">
            Try: <em>"ابني schema لمدرسة فيها طلاب ومدرسين"</em>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1e293b"
        />
        <Controls
          style={{ background: '#1e293b', border: '1px solid #334155' }}
        />
        <MiniMap
          nodeColor="#334155"
          maskColor="rgba(15,23,42,0.7)"
          style={{ background: '#111827', border: '1px solid #1e293b' }}
        />
      </ReactFlow>

      <div className="diagram-stats">
        <span>{schema.entities.length} entities</span>
        <span>{schema.relationships.length} relationships</span>
        {schema.enums.length > 0 && <span>{schema.enums.length} enums</span>}
      </div>
    </div>
  );
}
