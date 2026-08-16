/**
 * AuthHero — animated schema diagram, pure SVG + CSS, no images.
 */

// ─── Data ─────────────────────────────────────────────────────────────────────

const NODES = [
  {
    id: 'user', x: 40, y: 40, color: '#3b82f6', label: 'User',
    fields: [
      { name: 'id',    type: 'uuid',   pk: true,  fk: false },
      { name: 'email', type: 'string', pk: false, fk: false },
      { name: 'name',  type: 'string', pk: false, fk: false },
      { name: 'role',  type: 'enum',   pk: false, fk: false },
    ],
  },
  {
    id: 'project', x: 310, y: 20, color: '#8b5cf6', label: 'Project',
    fields: [
      { name: 'id',      type: 'uuid',   pk: true,  fk: false },
      { name: 'title',   type: 'string', pk: false, fk: false },
      { name: 'ownerId', type: 'uuid',   pk: false, fk: true  },
      { name: 'status',  type: 'enum',   pk: false, fk: false },
    ],
  },
  {
    id: 'schema', x: 560, y: 80, color: '#06b6d4', label: 'Schema',
    fields: [
      { name: 'id',        type: 'uuid',   pk: true,  fk: false },
      { name: 'name',      type: 'string', pk: false, fk: false },
      { name: 'projectId', type: 'uuid',   pk: false, fk: true  },
      { name: 'version',   type: 'int',    pk: false, fk: false },
    ],
  },
  {
    id: 'entity', x: 360, y: 280, color: '#10b981', label: 'Entity',
    fields: [
      { name: 'id',       type: 'uuid',   pk: true,  fk: false },
      { name: 'name',     type: 'string', pk: false, fk: false },
      { name: 'schemaId', type: 'uuid',   pk: false, fk: true  },
    ],
  },
  {
    id: 'field', x: 90, y: 270, color: '#f59e0b', label: 'Field',
    fields: [
      { name: 'id',       type: 'uuid',   pk: true,  fk: false },
      { name: 'name',     type: 'string', pk: false, fk: false },
      { name: 'type',     type: 'enum',   pk: false, fk: false },
      { name: 'entityId', type: 'uuid',   pk: false, fk: true  },
    ],
  },
];

const EDGES = [
  { from: 'user',    to: 'project', label: '1:N', color: '#3b82f6' },
  { from: 'project', to: 'schema',  label: '1:N', color: '#8b5cf6' },
  { from: 'schema',  to: 'entity',  label: '1:N', color: '#06b6d4' },
  { from: 'entity',  to: 'field',   label: '1:N', color: '#10b981' },
  { from: 'user',    to: 'field',   label: '1:N', color: '#f59e0b' },
];

// ─── Card dimensions ──────────────────────────────────────────────────────────

const W  = 170;   // card width
const FH = 20;    // field row height
const HH = 32;    // header height
const PR = 6;     // card padding bottom

function cardHeight(n: typeof NODES[0]) {
  return HH + n.fields.length * FH + PR;
}

function cardCentre(n: typeof NODES[0]): [number, number] {
  return [n.x + W / 2, n.y + cardHeight(n) / 2];
}

// ─── Type colour ──────────────────────────────────────────────────────────────

const TC: Record<string, string> = {
  uuid: '#8b5cf6', string: '#60a5fa', enum: '#f59e0b',
  int: '#34d399', json: '#06b6d4', bool: '#f472b6',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AuthHero() {
  const VW = 780;
  const VH = 430;

  return (
    <div className="auth-hero" aria-hidden="true">
      {/* Ambient blobs */}
      <div className="ah-blob ah-blob--blue"   />
      <div className="ah-blob ah-blob--purple" />
      <div className="ah-blob ah-blob--teal"   />

      {/* Dot grid */}
      <div className="ah-grid" />

      {/* SVG */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="ah-svg"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Per-colour arrow markers */}
          {[...new Set(EDGES.map((e) => e.color))].map((c) => (
            <marker key={c} id={`ar-${c.slice(1)}`}
              markerWidth="7" markerHeight="7" refX="6" refY="3"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L7,3 z" fill={c} fillOpacity="0.7" />
            </marker>
          ))}

          {/* Soft glow filter */}
          <filter id="fglow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Edges ── */}
        {EDGES.map((edge, i) => {
          const src = NODES.find((n) => n.id === edge.from)!;
          const tgt = NODES.find((n) => n.id === edge.to)!;
          const [x1, y1] = cardCentre(src);
          const [x2, y2] = cardCentre(tgt);
          // Cubic bezier for a natural curve
          const dx = x2 - x1;
          const cx1 = x1 + dx * 0.45;
          const cx2 = x2 - dx * 0.45;
          const d = `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 - 14;

          return (
            <g key={i} className={`ah-edge ah-edge--${i}`}>
              {/* glow */}
              <path d={d} fill="none"
                stroke={edge.color} strokeWidth="6" strokeOpacity="0.07"
                filter="url(#fglow)" />
              {/* line */}
              <path d={d} fill="none"
                stroke={edge.color} strokeWidth="1.5" strokeOpacity="0.5"
                strokeDasharray="5 3"
                markerEnd={`url(#ar-${edge.color.slice(1)})`} />
              {/* label pill */}
              <rect x={mx - 14} y={my - 8} width={28} height={13}
                rx="6.5" fill="#0b1220"
                stroke={edge.color} strokeWidth="0.75" strokeOpacity="0.5" />
              <text x={mx} y={my + 1.5} textAnchor="middle"
                fontSize="7" fontWeight="700" fontFamily="monospace"
                fill={edge.color} fillOpacity="0.9">
                {edge.label}
              </text>
            </g>
          );
        })}

        {/* ── Nodes ── */}
        {NODES.map((node, ni) => {
          const ch = cardHeight(node);
          // Float amounts per node
          const floatAmounts = [-5, -7, -5, -6, -7];
          const floatDurs    = ['5s','6s','7s','5.5s','6.5s'];
          const floatDelays  = ['0.8s','1s','1.2s','0.6s','0.4s'];

          return (
            <g key={node.id} className={`ah-node ah-node--${ni}`}>
              {/* SVG-native float animation on the group itself */}
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0,0; 0,${floatAmounts[ni]}; 0,0`}
                dur={floatDurs[ni]}
                begin={floatDelays[ni]}
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
              />
              {/* drop shadow */}
              <rect x={node.x + 3} y={node.y + 4}
                width={W} height={ch} rx="11"
                fill="rgba(0,0,0,0.45)" />

              {/* card bg */}
              <rect x={node.x} y={node.y}
                width={W} height={ch} rx="11"
                fill="rgba(11,18,35,0.95)"
                stroke={node.color} strokeWidth="1" strokeOpacity="0.45" />

              {/* header bg */}
              <rect x={node.x} y={node.y}
                width={W} height={HH} rx="11"
                fill={node.color} fillOpacity="0.12" />
              <rect x={node.x} y={node.y + HH - 1}
                width={W} height="1"
                fill={node.color} fillOpacity="0.25" />

              {/* header icon */}
              <rect x={node.x + 9} y={node.y + 9} width="13" height="13"
                rx="3.5" fill={node.color} fillOpacity="0.2"
                stroke={node.color} strokeWidth="0.7" strokeOpacity="0.5" />
              <text x={node.x + 15.5} y={node.y + 19}
                textAnchor="middle" fontSize="7"
                fill={node.color} fontWeight="800">▣</text>

              {/* entity name */}
              <text x={node.x + 27} y={node.y + 21}
                fontSize="11.5" fontWeight="700"
                fill="#f1f5f9" fontFamily="system-ui,sans-serif"
                letterSpacing="-0.3">
                {node.label}
              </text>

              {/* field count badge */}
              <rect x={node.x + W - 26} y={node.y + 9} width="18" height="12"
                rx="6" fill={node.color} fillOpacity="0.12"
                stroke={node.color} strokeWidth="0.6" strokeOpacity="0.4" />
              <text x={node.x + W - 17} y={node.y + 19}
                textAnchor="middle" fontSize="6.5"
                fontWeight="700" fill={node.color} fillOpacity="0.8">
                {node.fields.length}
              </text>

              {/* fields */}
              {node.fields.map((f, fi) => {
                const fy = node.y + HH + fi * FH + 4;
                const tc = TC[f.type] ?? '#94a3b8';

                return (
                  <g key={f.name}>
                    {/* left colour bar */}
                    <rect x={node.x} y={fy} width="3" height={FH - 3}
                      rx="1.5" fill={tc} fillOpacity="0.65" />

                    {/* badge */}
                    {f.pk && (
                      <>
                        <rect x={node.x + 6} y={fy + 3} width="14" height="10"
                          rx="3" fill="rgba(139,92,246,0.2)"
                          stroke="rgba(139,92,246,0.4)" strokeWidth="0.6" />
                        <text x={node.x + 13} y={fy + 11}
                          textAnchor="middle" fontSize="5.5"
                          fontWeight="800" fill="#c4b5fd">PK</text>
                      </>
                    )}
                    {f.fk && !f.pk && (
                      <>
                        <rect x={node.x + 6} y={fy + 3} width="12" height="10"
                          rx="3" fill="rgba(245,158,11,0.15)"
                          stroke="rgba(245,158,11,0.35)" strokeWidth="0.6" />
                        <text x={node.x + 12} y={fy + 11}
                          textAnchor="middle" fontSize="5.5"
                          fontWeight="800" fill="#fcd34d">FK</text>
                      </>
                    )}

                    {/* field name */}
                    <text x={node.x + (f.pk || f.fk ? 24 : 8)} y={fy + 13}
                      fontSize="9.5" fill="#cbd5e1"
                      fontFamily="system-ui,sans-serif" fontWeight="500">
                      {f.name}
                    </text>

                    {/* field type */}
                    <text x={node.x + W - 7} y={fy + 13}
                      textAnchor="end" fontSize="8"
                      fill={tc} fillOpacity="0.8"
                      fontFamily="monospace">
                      {f.type}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Tagline */}
      <div className="ah-tagline">
        <span className="ah-tagline-brand">Escema</span>
        <span className="ah-tagline-sep">—</span>
        <span className="ah-tagline-sub">Build · Visualize · Document</span>
      </div>
    </div>
  );
}
