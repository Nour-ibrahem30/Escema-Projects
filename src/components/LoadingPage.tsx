import { useEffect, useState } from 'react';

interface LoadingPageProps {
  onComplete: () => void;
}

type FieldType =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'uuid'
  | 'enum'
  | 'timestamp';

interface PreviewField {
  name: string;
  type: FieldType;
  primaryKey?: boolean;
  foreignKey?: boolean;
}

interface PreviewNode {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
  fields: PreviewField[];
}

interface PreviewEdge {
  from: string;
  to: string;
  label: string;
  color: string;
  dash?: string;
}

const NODES: PreviewNode[] = [
  {
    id: 'user',
    x: 40,
    y: 45,
    color: '#60a5fa',
    name: 'User',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        primaryKey: true,
      },
      {
        name: 'email',
        type: 'string',
      },
      {
        name: 'name',
        type: 'string',
      },
      {
        name: 'role',
        type: 'enum',
      },
    ],
  },

  {
    id: 'project',
    x: 310,
    y: 20,
    color: '#a78bfa',
    name: 'Project',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        primaryKey: true,
      },
      {
        name: 'title',
        type: 'string',
      },
      {
        name: 'ownerId',
        type: 'uuid',
        foreignKey: true,
      },
      {
        name: 'status',
        type: 'enum',
      },
    ],
  },

  {
    id: 'schema',
    x: 580,
    y: 55,
    color: '#22d3ee',
    name: 'Schema',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        primaryKey: true,
      },
      {
        name: 'name',
        type: 'string',
      },
      {
        name: 'projectId',
        type: 'uuid',
        foreignKey: true,
      },
      {
        name: 'version',
        type: 'integer',
      },
    ],
  },

  {
    id: 'entity',
    x: 380,
    y: 285,
    color: '#34d399',
    name: 'Entity',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        primaryKey: true,
      },
      {
        name: 'name',
        type: 'string',
      },
      {
        name: 'schemaId',
        type: 'uuid',
        foreignKey: true,
      },
    ],
  },

  {
    id: 'field',
    x: 100,
    y: 285,
    color: '#fb923c',
    name: 'Field',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        primaryKey: true,
      },
      {
        name: 'name',
        type: 'string',
      },
      {
        name: 'type',
        type: 'enum',
      },
      {
        name: 'entityId',
        type: 'uuid',
        foreignKey: true,
      },
    ],
  },
];

const EDGES: PreviewEdge[] = [
  {
    from: 'user',
    to: 'project',
    label: '1 : N',
    color: '#60a5fa',
    dash: '6 4',
  },

  {
    from: 'project',
    to: 'schema',
    label: '1 : N',
    color: '#a78bfa',
    dash: '6 4',
  },

  {
    from: 'schema',
    to: 'entity',
    label: '1 : N',
    color: '#34d399',
    dash: '6 4',
  },

  {
    from: 'entity',
    to: 'field',
    label: '1 : N',
    color: '#fb923c',
    dash: '6 4',
  },
];

const TYPE_COLOR: Record<FieldType, string> = {
  string: '#60a5fa',
  integer: '#34d399',
  boolean: '#f472b6',
  uuid: '#a78bfa',
  enum: '#fbbf24',
  timestamp: '#fb923c',
};

const CARD_WIDTH = 170;
const FIELD_HEIGHT = 22;
const HEADER_HEIGHT = 38;
const CARD_PADDING = 8;

function getCardHeight(node: PreviewNode): number {
  return (
    HEADER_HEIGHT +
    node.fields.length * FIELD_HEIGHT +
    CARD_PADDING
  );
}

function getCardCenter(
  node: PreviewNode
): [number, number] {
  return [
    node.x + CARD_WIDTH / 2,
    node.y + getCardHeight(node) / 2,
  ];
}

export function LoadingPage({
  onComplete,
}: LoadingPageProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setFadeOut(true);
    }, 2500);

    const completeTimer = window.setTimeout(() => {
      onComplete();
    }, 3300);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`loading-page${
        fadeOut ? ' loading-page--fade-out' : ''
      }`}
    >
      {/* Ambient Background */}
      <div className="ah-blob ah-blob--blue" />
      <div className="ah-blob ah-blob--purple" />
      <div className="ah-blob ah-blob--teal" />

      {/* Dot Grid */}
      <div className="ah-grid" />

      {/* Diagram */}
      <svg
        className="ah-svg"
        viewBox="0 0 800 470"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Glow */}
          <filter
            id="loading-glow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur
              stdDeviation="4"
              result="blur"
            />

            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Relationship arrows */}
          {[
            ...new Set(
              EDGES.map((edge) => edge.color)
            ),
          ].map((color) => (
            <marker
              key={color}
              id={`loading-arrow-${color.replace(
                '#',
                ''
              )}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0,0 L0,7 L8,3.5 z"
                fill={color}
                fillOpacity="0.8"
              />
            </marker>
          ))}
        </defs>

        {/* ===================================== */}
        {/* RELATIONSHIPS */}
        {/* ===================================== */}

        {EDGES.map((edge, index) => {
          const source = NODES.find(
            (node) => node.id === edge.from
          );

          const target = NODES.find(
            (node) => node.id === edge.to
          );

          if (!source || !target) {
            return null;
          }

          const [x1, y1] = getCardCenter(source);
          const [x2, y2] = getCardCenter(target);

          const dx = x2 - x1;

          const controlX1 = x1 + dx * 0.45;
          const controlX2 = x2 - dx * 0.45;

          const path = `
            M ${x1} ${y1}
            C ${controlX1} ${y1},
              ${controlX2} ${y2},
              ${x2} ${y2}
          `;

          const labelX = (x1 + x2) / 2;
          const labelY =
            (y1 + y2) / 2 - 14;

          return (
            <g
              key={`${edge.from}-${edge.to}`}
              className={`ah-edge ah-edge--${index}`}
            >
              {/* Glow */}
              <path
                d={path}
                fill="none"
                stroke={edge.color}
                strokeWidth="7"
                strokeOpacity="0.08"
                filter="url(#loading-glow)"
              />

              {/* Main line */}
              <path
                d={path}
                fill="none"
                stroke={edge.color}
                strokeWidth="1.5"
                strokeOpacity="0.6"
                strokeDasharray={
                  edge.dash ?? '6 4'
                }
                markerEnd={`url(#loading-arrow-${edge.color.replace(
                  '#',
                  ''
                )})`}
              />

              {/* Relationship badge */}
              <rect
                x={labelX - 18}
                y={labelY - 9}
                width="36"
                height="16"
                rx="8"
                fill="#0b1220"
                stroke={edge.color}
                strokeWidth="0.8"
                strokeOpacity="0.7"
              />

              <text
                x={labelX}
                y={labelY + 2.5}
                textAnchor="middle"
                fontSize="7"
                fontWeight="700"
                fontFamily="monospace"
                fill={edge.color}
              >
                {edge.label}
              </text>
            </g>
          );
        })}

        {/* ===================================== */}
        {/* NODES */}
        {/* ===================================== */}

        {NODES.map((node, nodeIndex) => {
          const cardHeight =
            getCardHeight(node);

          const floatAmounts = [
            -6,
            -8,
            -5,
            -7,
            -6,
          ];

          const floatDurations = [
            '5s',
            '6s',
            '7s',
            '5.5s',
            '6.5s',
          ];

          const floatDelays = [
            '0s',
            '0.5s',
            '1s',
            '0.3s',
            '0.8s',
          ];

          return (
            <g
              key={node.id}
              className={`ah-node ah-node--${nodeIndex}`}
            >
              {/* Floating animation */}
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0,0; 0,${
                  floatAmounts[nodeIndex]
                }; 0,0`}
                dur={floatDurations[nodeIndex]}
                begin={floatDelays[nodeIndex]}
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="
                  0.45 0 0.55 1;
                  0.45 0 0.55 1
                "
              />

              {/* Shadow */}
              <rect
                x={node.x + 4}
                y={node.y + 5}
                width={CARD_WIDTH}
                height={cardHeight}
                rx="12"
                fill="rgba(0,0,0,0.4)"
              />

              {/* Card */}
              <rect
                x={node.x}
                y={node.y}
                width={CARD_WIDTH}
                height={cardHeight}
                rx="12"
                fill="rgba(11,18,35,0.97)"
                stroke={node.color}
                strokeWidth="1.2"
                strokeOpacity="0.5"
              />

              {/* Header */}
              <rect
                x={node.x}
                y={node.y}
                width={CARD_WIDTH}
                height={HEADER_HEIGHT}
                rx="12"
                fill={node.color}
                fillOpacity="0.13"
              />

              {/* Header divider */}
              <rect
                x={node.x}
                y={
                  node.y +
                  HEADER_HEIGHT -
                  1
                }
                width={CARD_WIDTH}
                height="1"
                fill={node.color}
                fillOpacity="0.3"
              />

              {/* Entity icon */}
              <rect
                x={node.x + 10}
                y={node.y + 11}
                width="16"
                height="16"
                rx="4"
                fill={node.color}
                fillOpacity="0.2"
                stroke={node.color}
                strokeOpacity="0.6"
              />

              <text
                x={node.x + 18}
                y={node.y + 22}
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill={node.color}
              >
                ▣
              </text>

              {/* Node name */}
              <text
                x={node.x + 34}
                y={node.y + 24}
                fontSize="12"
                fontWeight="700"
                fill="#f1f5f9"
                fontFamily="system-ui, sans-serif"
              >
                {node.name}
              </text>

              {/* Field count */}
              <rect
                x={
                  node.x +
                  CARD_WIDTH -
                  30
                }
                y={node.y + 12}
                width="20"
                height="14"
                rx="7"
                fill={node.color}
                fillOpacity="0.15"
                stroke={node.color}
                strokeWidth="0.7"
                strokeOpacity="0.5"
              />

              <text
                x={
                  node.x +
                  CARD_WIDTH -
                  20
                }
                y={node.y + 22}
                textAnchor="middle"
                fontSize="7"
                fontWeight="700"
                fill={node.color}
              >
                {node.fields.length}
              </text>

              {/* ================================= */}
              {/* FIELDS */}
              {/* ================================= */}

              {node.fields.map(
                (field, fieldIndex) => {
                  const fieldY =
                    node.y +
                    HEADER_HEIGHT +
                    fieldIndex *
                      FIELD_HEIGHT;

                  const typeColor =
                    TYPE_COLOR[
                      field.type
                    ];

                  return (
                    <g
                      key={`${node.id}-${field.name}`}
                    >
                      {/* Type indicator */}
                      <rect
                        x={node.x}
                        y={fieldY + 3}
                        width="3"
                        height={
                          FIELD_HEIGHT - 4
                        }
                        rx="1.5"
                        fill={typeColor}
                        fillOpacity="0.8"
                      />

                      {/* PK Badge */}
                      {field.primaryKey && (
                        <>
                          <rect
                            x={
                              node.x + 8
                            }
                            y={
                              fieldY + 5
                            }
                            width="15"
                            height="11"
                            rx="3"
                            fill="rgba(139,92,246,0.2)"
                            stroke="rgba(139,92,246,0.5)"
                            strokeWidth="0.6"
                          />

                          <text
                            x={
                              node.x +
                              15.5
                            }
                            y={
                              fieldY + 13
                            }
                            textAnchor="middle"
                            fontSize="5.5"
                            fontWeight="800"
                            fill="#c4b5fd"
                          >
                            PK
                          </text>
                        </>
                      )}

                      {/* FK Badge */}
                      {field.foreignKey && (
                        <>
                          <rect
                            x={
                              node.x + 8
                            }
                            y={
                              fieldY + 5
                            }
                            width="15"
                            height="11"
                            rx="3"
                            fill="rgba(245,158,11,0.15)"
                            stroke="rgba(245,158,11,0.45)"
                            strokeWidth="0.6"
                          />

                          <text
                            x={
                              node.x +
                              15.5
                            }
                            y={
                              fieldY + 13
                            }
                            textAnchor="middle"
                            fontSize="5.5"
                            fontWeight="800"
                            fill="#fcd34d"
                          >
                            FK
                          </text>
                        </>
                      )}

                      {/* Field name */}
                      <text
                        x={
                          node.x +
                          (field.primaryKey ||
                          field.foreignKey
                            ? 29
                            : 10)
                        }
                        y={
                          fieldY + 15
                        }
                        fontSize="9"
                        fill="#cbd5e1"
                        fontFamily="system-ui, sans-serif"
                      >
                        {field.name}
                      </text>

                      {/* Field type */}
                      <text
                        x={
                          node.x +
                          CARD_WIDTH -
                          9
                        }
                        y={
                          fieldY + 15
                        }
                        textAnchor="end"
                        fontSize="8"
                        fill={typeColor}
                        fillOpacity="0.9"
                        fontFamily="monospace"
                      >
                        {field.type}
                      </text>
                    </g>
                  );
                }
              )}
            </g>
          );
        })}
      </svg>

      {/* ===================================== */}
      {/* BRAND */}
      {/* ===================================== */}

      <div className="ah-tagline">
        <span className="ah-tagline-brand">
          Escema
        </span>

        <span className="ah-tagline-sep">
          —
        </span>

        <span className="ah-tagline-sub">
          Build · Visualize · Document
        </span>
      </div>
    </div>
  );
}