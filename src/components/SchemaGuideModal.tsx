import { useEffect, useCallback } from 'react';
import { SchemaGuide } from './SchemaGuide';
import type { SchemaModel } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  schema: SchemaModel;
  lang?: 'ar' | 'en';
};

export function SchemaGuideModal({ open, onClose, schema, lang }: Props) {
  // Close on Escape
  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const isAr = lang === 'ar';
  const title = isAr ? `شرح الـ Schema — ${schema.name}` : `Schema Guide — ${schema.name}`;
  const closeLabel = isAr ? 'إغلاق' : 'Close';

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="guide-modal"
        onClick={(e) => e.stopPropagation()}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="guide-modal-header">
          <h2 className="guide-modal-title">{title}</h2>
          <button
            type="button"
            className="guide-modal-close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="guide-modal-body">
          <SchemaGuide schema={schema} lang={lang} />
        </div>

        {/* Footer */}
        <div className="guide-modal-footer">
          <span className="meta">
            {schema.entities.length} {isAr ? 'جدول' : 'tables'} ·{' '}
            {schema.relationships.length} {isAr ? 'علاقة' : 'relationships'} ·{' '}
            {schema.entities.reduce((s, e) => s + e.fields.length, 0)}{' '}
            {isAr ? 'حقل' : 'fields'}
          </span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
