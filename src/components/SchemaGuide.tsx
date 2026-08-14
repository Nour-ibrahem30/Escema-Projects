import { useState } from 'react';
import type { SchemaModel, Entity, Relationship, DataType } from '../types';

// ─── Language detection ───────────────────────────────────────────────────────

function detectLang(text: string): 'ar' | 'en' {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return arabicChars > text.length * 0.2 ? 'ar' : 'en';
}

type Lang = 'ar' | 'en';

const T = {
  ar: {
    guide: 'الدليل',
    emptyTitle: 'دليل الـ Schema',
    emptyDesc: 'استخدم شريط الـ AI في الأسفل لتوليد الـ schema، وارجع هنا لشرح كامل لما تم بناؤه.',
    emptyHint: 'مثال: "ابني schema لمتجر إلكتروني"',
    overview: '📊 نظرة عامة',
    tables: 'جدول',
    relations: 'علاقة',
    fields: 'حقل',
    enums: 'Enum',
    indexes: 'Index',
    howToUse: '🗂 كيف تستخدم هذه الأداة',
    tabsInfo: [
      { badge: 'Inspector', desc: 'اضغط على أي entity في الـ diagram أو في القائمة اليسرى لتعديل fields الخاصة بها.' },
      { badge: 'Enums',     desc: 'أدر القيم الثابتة مثل OrderStatus أو UserRole.' },
      { badge: 'Indexes',   desc: 'أضف indexes لتسريع الاستعلامات. الـ FK fields بتاخد indexes تلقائياً.' },
      { badge: 'Export',    desc: 'صدّر الـ schema كـ SQL أو Prisma أو JSON جاهزة للاستخدام.' },
    ],
    tablesSection: '🗃 الجداول',
    relsSection:   '🔗 العلاقات',
    enumsSection:  '🏷 Enums',
    indexesSection:'⚡ Indexes',
    indexesHint:   'هذه الـ indexes تم إنشاؤها تلقائياً لتسريع البحث على FK fields والحقول الفريدة.',
    pk: 'المفتاح الأساسي',
    fk: 'المفاتيح الخارجية',
    statusFields: 'حقول الحالة',
    uniqueFields: 'حقول فريدة',
    dataFields:   'حقول البيانات',
    timestamps:   'التواريخ',
    softDelete:   'حذف ناعم',
    junction:     'جدول وصل',
    required:     'مطلوب',
    nullable:     'اختياري',
    relExplain: {
      'one-to-one':   'كل سجل في اليسار مرتبط بسجل واحد فقط في اليمين.',
      'one-to-many':  'سجل واحد في اليسار يمكنه أن يرتبط بسجلات كثيرة في اليمين.',
      'many-to-one':  'سجلات كثيرة في اليسار ترتبط بسجل واحد في اليمين.',
      'many-to-many': 'السجلات على الجانبين يمكنها الارتباط بسجلات متعددة من الجانب الآخر.',
    },
    on: 'على',
    fieldCount: (n: number) => `${n} حقل`,
  },
  en: {
    guide: 'Guide',
    emptyTitle: 'Schema Guide',
    emptyDesc: 'Use the AI bar below to generate a schema, then come back here for a full explanation.',
    emptyHint: 'Try: "Build a schema for an e-commerce store"',
    overview: '📊 Overview',
    tables: 'Tables',
    relations: 'Relations',
    fields: 'Fields',
    enums: 'Enums',
    indexes: 'Indexes',
    howToUse: '🗂 How to use this tool',
    tabsInfo: [
      { badge: 'Inspector', desc: 'Click any entity in the diagram or left panel to view and edit its fields.' },
      { badge: 'Enums',     desc: 'Manage fixed-value types like OrderStatus or UserRole.' },
      { badge: 'Indexes',   desc: 'Add indexes to speed up queries. FK fields get auto-indexed by the AI.' },
      { badge: 'Export',    desc: 'Download as SQL, Prisma schema, or JSON — ready for your project.' },
    ],
    tablesSection: '🗃 Tables',
    relsSection:   '🔗 Relationships',
    enumsSection:  '🏷 Enums',
    indexesSection:'⚡ Indexes',
    indexesHint:   'These indexes are auto-created to speed up lookups on foreign keys and unique fields.',
    pk: 'Primary Key',
    fk: 'Foreign Keys',
    statusFields: 'Status Fields',
    uniqueFields: 'Unique Fields',
    dataFields:   'Data Fields',
    timestamps:   'Timestamps',
    softDelete:   'soft-delete',
    junction:     'Junction',
    required:     'required',
    nullable:     'nullable',
    relExplain: {
      'one-to-one':   'Each record on the left links to exactly one record on the right.',
      'one-to-many':  'One record on the left can have many records on the right.',
      'many-to-one':  'Many records on the left link to one record on the right.',
      'many-to-many': 'Records on both sides can link to multiple on the other side.',
    },
    on: 'on',
    fieldCount: (n: number) => `${n} fields`,
  },
};

function formatType(t: DataType): string {
  return typeof t === 'object' ? `enum` : t;
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  schema: SchemaModel;
  lang?: Lang;
};

export function SchemaGuide({ schema, lang: forcedLang }: Props) {
  const lang = forcedLang ?? detectLang(schema.description ?? schema.name ?? '');
  const t = T[lang];

  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [showTabs, setShowTabs] = useState(false);

  if (schema.entities.length === 0) {
    return (
      <div className="guide-empty">
        <div className="guide-empty-icon">📖</div>
        <h3>{t.emptyTitle}</h3>
        <p>{t.emptyDesc}</p>
        <p className="hint"><em>{t.emptyHint}</em></p>
      </div>
    );
  }

  const totalFields = schema.entities.reduce((s, e) => s + e.fields.length, 0);

  return (
    <div className="schema-guide" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* ── Overview stats ── */}
      <section className="guide-section">
        <h3 className="guide-section-title">{t.overview}</h3>
        {schema.description && <p className="guide-desc">{schema.description}</p>}
        <div className="guide-overview-grid">
          {[
            { num: schema.entities.length,      label: t.tables },
            { num: schema.relationships.length,  label: t.relations },
            { num: totalFields,                  label: t.fields },
            ...(schema.enums.length   ? [{ num: schema.enums.length,   label: t.enums }]   : []),
            ...(schema.indexes.length ? [{ num: schema.indexes.length, label: t.indexes }] : []),
          ].map(({ num, label }) => (
            <div key={label} className="guide-stat">
              <span className="guide-stat-num">{num}</span>
              <span className="guide-stat-label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How to use (collapsible) ── */}
      <section className="guide-section">
        <button
          type="button"
          className="guide-collapse-btn"
          onClick={() => setShowTabs((v) => !v)}
        >
          {t.howToUse}
          <span className="guide-collapse-arrow">{showTabs ? '▲' : '▼'}</span>
        </button>
        {showTabs && (
          <div className="guide-tabs-list">
            {t.tabsInfo.map((item) => (
              <div key={item.badge} className="guide-tab-item">
                <span className="guide-tab-badge">{item.badge}</span>
                <span>{item.desc}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tables (accordion) ── */}
      <section className="guide-section">
        <h3 className="guide-section-title">{t.tablesSection}</h3>
        <div className="guide-entities">
          {schema.entities.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              schema={schema}
              t={t}
              expanded={expandedEntity === entity.id}
              onToggle={() =>
                setExpandedEntity((id) =>
                  id === entity.id ? null : entity.id,
                )
              }
            />
          ))}
        </div>
      </section>

      {/* ── Relationships ── */}
      {schema.relationships.length > 0 && (
        <section className="guide-section">
          <h3 className="guide-section-title">{t.relsSection}</h3>
          <div className="guide-rels">
            {schema.relationships.map((rel) => (
              <RelationshipCard key={rel.id} rel={rel} schema={schema} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── Enums ── */}
      {schema.enums.length > 0 && (
        <section className="guide-section">
          <h3 className="guide-section-title">{t.enumsSection}</h3>
          <div className="guide-enums">
            {schema.enums.map((enumDef) => (
              <div key={enumDef.id} className="guide-enum-card">
                <span className="guide-enum-name">{enumDef.name}</span>
                <div className="guide-enum-values">
                  {enumDef.values.map((v) => (
                    <span key={v} className="guide-enum-value">{v}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Indexes ── */}
      {schema.indexes.length > 0 && (
        <section className="guide-section">
          <h3 className="guide-section-title">{t.indexesSection}</h3>
          <p className="guide-hint">{t.indexesHint}</p>
          <div className="guide-indexes">
            {schema.indexes.map((idx) => {
              const entity = schema.entities.find((e) => e.id === idx.entityId);
              const fieldNames = idx.fieldIds
                .map((fid) => entity?.fields.find((f) => f.id === fid)?.name ?? fid)
                .join(', ');
              return (
                <div key={idx.id} className="guide-index-row">
                  <code className="guide-index-name">{idx.name}</code>
                  <span className="meta">{t.on}</span>
                  <span className="guide-index-table">{entity?.name ?? '?'}</span>
                  <span className="meta">({fieldNames})</span>
                  {idx.unique && <span className="badge-mini unique">UNIQUE</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Entity Card (accordion) ──────────────────────────────────────────────────

type EntityCardProps = {
  entity: Entity;
  schema: SchemaModel;
  t: typeof T['en'];
  expanded: boolean;
  onToggle: () => void;
};

function EntityCard({ entity, schema, t, expanded, onToggle }: EntityCardProps) {
  const fkFields = entity.fields.filter(
    (f) => !f.primaryKey && f.name.endsWith('Id') && f.type === 'uuid',
  );
  const isJunction = fkFields.length >= 2 && entity.fields.length <= fkFields.length + 6;
  const pkField    = entity.fields.find((f) => f.primaryKey);
  const dataFields = entity.fields.filter((f) => !f.primaryKey && !fkFields.includes(f));

  const tsFields     = dataFields.filter((f) => ['createdAt','updatedAt','deletedAt'].includes(f.name));
  const statusFields = dataFields.filter((f) => f.name === 'status' || f.name.endsWith('Status'));
  const uniqueFields = dataFields.filter((f) => f.unique && !statusFields.includes(f));
  const otherFields  = dataFields.filter(
    (f) => !tsFields.includes(f) && !statusFields.includes(f),
  );

  const description = entity.description ?? (isJunction
    ? fkFields.map((f) => {
        const n = f.name.replace(/Id$/, '');
        return schema.entities.find((e) => e.name.toLowerCase() === n.toLowerCase())?.name ?? n;
      }).join(' ↔ ')
    : null);

  return (
    <div className="guide-entity-card">
      <button type="button" className="guide-entity-toggle" onClick={onToggle}>
        <span className="guide-entity-name">{entity.name}</span>
        <div className="guide-entity-badges">
          {isJunction && <span className="badge-mini fk">{t.junction}</span>}
          <span className="guide-entity-count">{t.fieldCount(entity.fields.length)}</span>
          <span className="guide-collapse-arrow">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {description && <p className="guide-entity-desc">{description}</p>}

      {expanded && (
        <div className="guide-field-groups">
          {pkField && (
            <FieldGroup label={t.pk}>
              <FieldRow badge="pk" name={pkField.name} type={formatType(pkField.type)} />
            </FieldGroup>
          )}

          {fkFields.length > 0 && (
            <FieldGroup label={t.fk}>
              {fkFields.map((f) => {
                const refName   = f.name.replace(/Id$/, '');
                const refEntity = schema.entities.find(
                  (e) => e.name.toLowerCase() === refName.toLowerCase(),
                );
                return (
                  <FieldRow
                    key={f.id}
                    badge="fk"
                    name={f.name}
                    type={formatType(f.type)}
                    extra={refEntity ? `→ ${refEntity.name}` : undefined}
                    note={!f.nullable ? t.required : undefined}
                  />
                );
              })}
            </FieldGroup>
          )}

          {statusFields.length > 0 && (
            <FieldGroup label={t.statusFields}>
              {statusFields.map((f) => (
                <FieldRow key={f.id} badge="enum" name={f.name} type={formatType(f.type)} />
              ))}
            </FieldGroup>
          )}

          {uniqueFields.length > 0 && (
            <FieldGroup label={t.uniqueFields}>
              {uniqueFields.map((f) => (
                <FieldRow key={f.id} badge="unique" name={f.name} type={formatType(f.type)} />
              ))}
            </FieldGroup>
          )}

          {otherFields.length > 0 && (
            <FieldGroup label={t.dataFields}>
              {otherFields.map((f) => (
                <FieldRow
                  key={f.id}
                  name={f.name}
                  type={formatType(f.type)}
                  note={f.nullable ? t.nullable : undefined}
                />
              ))}
            </FieldGroup>
          )}

          {tsFields.length > 0 && (
            <FieldGroup label={t.timestamps}>
              {tsFields.map((f) => (
                <FieldRow
                  key={f.id}
                  name={f.name}
                  type="datetime"
                  note={f.name === 'deletedAt' ? t.softDelete : undefined}
                />
              ))}
            </FieldGroup>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="guide-field-group">
      <span className="guide-field-group-label">{label}</span>
      <div className="guide-field-list">{children}</div>
    </div>
  );
}

function FieldRow({
  badge, name, type, extra, note,
}: {
  badge?: 'pk' | 'fk' | 'unique' | 'enum';
  name: string;
  type: string;
  extra?: string;
  note?: string;
}) {
  return (
    <span className="guide-field-row">
      {badge && <span className={`badge-mini ${badge}`}>{badge.toUpperCase()}</span>}
      <code>{name}</code>
      <span className="meta">{type}</span>
      {extra && <span className="meta">{extra}</span>}
      {note  && <span className={`meta ${note === 'nullable' || note === 'اختياري' ? 'nullable' : note === 'required' || note === 'مطلوب' ? 'required' : ''}`}>{note}</span>}
    </span>
  );
}

// ─── Relationship card ────────────────────────────────────────────────────────

const REL_ICON: Record<string, string> = {
  'one-to-one': '1 — 1', 'one-to-many': '1 — ∞',
  'many-to-one': '∞ — 1', 'many-to-many': '∞ — ∞',
};

function RelationshipCard({
  rel, schema, t,
}: { rel: Relationship; schema: SchemaModel; t: typeof T['en'] }) {
  const source = schema.entities.find((e) => e.id === rel.sourceEntityId);
  const target = schema.entities.find((e) => e.id === rel.targetEntityId);
  if (!source || !target) return null;

  return (
    <div className="guide-rel-card">
      <div className="guide-rel-header">
        <span className="guide-rel-entity">{source.name}</span>
        <span className="guide-rel-type-badge">{REL_ICON[rel.type]}</span>
        <span className="guide-rel-entity">{target.name}</span>
        {rel.name && <span className="guide-rel-name">({rel.name})</span>}
      </div>
      <p className="guide-rel-explain">
        {t.relExplain[rel.type as keyof typeof t.relExplain]}
      </p>
    </div>
  );
}
