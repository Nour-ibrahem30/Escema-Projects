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
  type EdgeTypes,
  Handle,
  Position,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Entity } from '../types';
import { useSchemaStore } from '../stores/schemaStore';

// ─── Field type colour map ────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  string:    '#60a5fa',  // blue
  integer:   '#34d399',  // green
  float:     '#34d399',
  decimal:   '#34d399',
  boolean:   '#f472b6',  // pink
  date:      '#fb923c',  // orange
  datetime:  '#fb923c',
  timestamp: '#fb923c',
  uuid:      '#a78bfa',  // purple
  text:      '#60a5fa',
  json:      '#fbbf24',  // amber
  blob:      '#94a3b8',  // muted
};

function typeColor(type: string | { enum: string }): string {
  if (typeof type === 'object') return '#e879f9'; // enum — fuchsia
  return TYPE_COLOR[type.toLowerCase()] ?? '#94a3b8';
}

// ─── Entity Node ──────────────────────────────────────────────────────────────

type EntityNodeData = {
  entity: Entity;
  isSelected: boolean;
};

function EntityNode({ data }: { data: EntityNodeData }) {
  const { entity, isSelected } = data;

  return (
    <div className={`diagram-entity-node${isSelected ? ' selected' : ''}`}>
      {/* Handles on all sides */}
      <Handle type="target" position={Position.Left}   id="left"   className="entity-handle" />
      <Handle type="source" position={Position.Right}  id="right"  className="entity-handle" />
      <Handle type="target" position={Position.Top}    id="top"    className="entity-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="entity-handle" />

      {/* Header */}
      <div className="entity-node-header">
        <div className="entity-node-header-row">
          <span className="entity-node-icon">▣</span>
          <span className="entity-node-name">{entity.name}</span>
          <span className="entity-node-count">{entity.fields.length}</span>
        </div>
        {entity.description && (
          <span className="entity-node-desc">{entity.description}</span>
        )}
      </div>

      {/* Fields */}
      <div className="entity-node-fields">
        {entity.fields.map((field) => (
          <div key={field.id} className="entity-node-field">
            {/* Left accent bar coloured by type */}
            <span
              className="field-type-bar"
              style={{ background: typeColor(field.type) }}
            />

            {/* Badges */}
            <span className="field-flags">
              {field.primaryKey && <span className="badge-mini pk">PK</span>}
              {field.unique && !field.primaryKey && <span className="badge-mini unique">U</span>}
              {field.references && <span className="badge-mini fk">FK</span>}
            </span>

            <span className="field-name">{field.name}</span>

            <span
              className="field-type"
              style={{ color: typeColor(field.type) }}
            >
              {typeof field.type === 'object'
                ? `enum:${field.type.enum}`
                : field.type}
            </span>

            {field.nullable === false && (
              <span className="field-required" title="NOT NULL">!</span>
            )}
          </div>
        ))}

        {entity.fields.length === 0 && (
          <div className="entity-node-empty-fields">no fields yet</div>
        )}
      </div>
    </div>
  );
}

// ─── Custom Relationship Edge ─────────────────────────────────────────────────

const REL_META: Record<string, { label: string; color: string; dash?: string }> = {
  'one-to-one':   { label: '1 : 1', color: '#60a5fa' },
  'one-to-many':  { label: '1 : N', color: '#34d399' },
  'many-to-one':  { label: 'N : 1', color: '#fb923c' },
  'many-to-many': { label: 'N : M', color: '#e879f9', dash: '6 3' },
};

function RelationshipEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const meta = REL_META[label as string] ?? { label: label as string, color: '#475569' };

  return (
    <>
      {/* Glow layer */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: meta.color,
          strokeWidth: selected ? 8 : 4,
          strokeDasharray: meta.dash,
          opacity: selected ? 0.25 : 0.1,
          filter: `blur(4px)`,
        }}
      />
      {/* Main line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: meta.color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: meta.dash,
        }}
        markerEnd={`url(#arrow-${meta.color.replace('#', '')})`}
      />

      {/* Floating label */}
      <EdgeLabelRenderer>
        <div
          className={`edge-label${selected ? ' selected' : ''}`}
          style={{
            transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
            borderColor: meta.color,
            color: meta.color,
          }}
        >
          {meta.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode };
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge };

// ─── DiagramCanvas ────────────────────────────────────────────────────────────

export function DiagramCanvas() {
  const schema             = useSchemaStore((s) => s.schema);
  const selectedEntityId   = useSchemaStore((s) => s.selectedEntityId);
  const selectEntity       = useSchemaStore((s) => s.selectEntity);
  const selectRelationship = useSchemaStore((s) => s.selectRelationship);
  const setEntityPosition  = useSchemaStore((s) => s.setEntityPosition);
  const addRelationship    = useSchemaStore((s) => s.addRelationship);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const schemaKeyRef = useRef('');

  useEffect(() => {
    const schemaKey = `${schema.id}:${schema.version}`;
    schemaKeyRef.current = schemaKey;

    const newNodes: Node[] = schema.entities.map((entity, index) => ({
      id:   entity.id,
      type: 'entity',
      position: entity.position ?? {
        x: 80 + (index % 3) * 360,
        y: 80 + Math.floor(index / 3) * 300,
      },
      data: { entity, isSelected: selectedEntityId === entity.id },
    }));

    const newEdges: Edge[] = schema.relationships.map((rel) => ({
      id:     rel.id,
      source: rel.sourceEntityId,
      target: rel.targetEntityId,
      type:   'relationship',
      label:  rel.type,
      data:   { relType: rel.type },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addRelationship(connection.source, connection.target, 'one-to-many');
      }
      setEdges((eds) => addEdge(connection, eds));
    },
    [addRelationship, setEdges],
  );

  const onNodeClick     = useCallback((_: React.MouseEvent, node: Node) => selectEntity(node.id), [selectEntity]);
  const onEdgeClick     = useCallback((_: React.MouseEvent, edge: Edge) => selectRelationship(edge.id), [selectRelationship]);
  const onNodeDragStop  = useCallback((_: unknown, node: Node) => setEntityPosition(node.id, node.position.x, node.position.y), [setEntityPosition]);
  const onPaneClick     = useCallback(() => selectEntity(null), [selectEntity]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (schema.entities.length === 0) {
    return (
      <div className="diagram-empty">
        {/* Subtle animated grid */}
        <div className="diagram-empty-bg" />

        <div className="placeholder-content">
          {/* Animated mini diagram icon */}
          <div className="placeholder-icon">
            <div className="pi-node pi-node--a">
              <div className="pi-node-dot" />
              <div className="pi-node-lines">
                <div className="pi-line pi-line--full" />
                <div className="pi-line pi-line--half" />
              </div>
            </div>
            <div className="pi-edge pi-edge--h" />
            <div className="pi-node pi-node--b">
              <div className="pi-node-dot" />
              <div className="pi-node-lines">
                <div className="pi-line pi-line--half" />
                <div className="pi-line pi-line--full" />
                <div className="pi-line pi-line--three-q" />
              </div>
            </div>
          </div>

          <h2>Your canvas is empty</h2>
          <p>Add an entity from the toolbar, or describe your schema to the AI.</p>
          <p className="hint">
            💬 Try: <em>"build a schema for a school with students and teachers"</em>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-canvas">
      {/* SVG defs for custom arrow markers */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          {Object.values(REL_META).map((m) => (
            <marker
              key={m.color}
              id={`arrow-${m.color.replace('#', '')}`}
              markerWidth="10" markerHeight="10"
              refX="9" refY="3"
              orient="auto" markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill={m.color} />
            </marker>
          ))}
        </defs>
      </svg>

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
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={null}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1.2}
          color="rgba(99,140,255,0.12)"
        />
        <Controls className="diagram-controls" />
        <MiniMap
          nodeColor={(node) => {
            const e = (node.data as EntityNodeData)?.entity;
            return e ? '#334155' : '#1e293b';
          }}
          maskColor="rgba(10,15,30,0.75)"
          className="diagram-minimap"
        />
      </ReactFlow>

      {/* Stats pill */}
      <div className="diagram-stats">
        <span>
          <span className="stat-dot" style={{ background: '#60a5fa' }} />
          {schema.entities.length} entities
        </span>
        <span>
          <span className="stat-dot" style={{ background: '#34d399' }} />
          {schema.relationships.length} relations
        </span>
        {schema.enums.length > 0 && (
          <span>
            <span className="stat-dot" style={{ background: '#e879f9' }} />
            {schema.enums.length} enums
          </span>
        )}
      </div>
    </div>
  );
}
