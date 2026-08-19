import { AVAILABLE_MODELS } from '../ai/config';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AISettingsModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="معلومات الذكاء الاصطناعي"
      >
        <div className="modal-header">
          <h2>🤖 الذكاء الاصطناعي</h2>
          <button type="button" className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              الخدمة تعمل تلقائياً — لا تحتاج لأي إعداد. النظام يختار أفضل model حسب نوع الطلب ويتحول تلقائياً للتالي عند أي مشكلة.
            </p>

            <label className="form-label" style={{ marginBottom: '0.5rem' }}>الـ Models المتاحة</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {AVAILABLE_MODELS.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{
                    background: 'var(--brand-500)',
                    color: '#fff',
                    borderRadius: 'var(--radius-full)',
                    width: '1.25rem',
                    height: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{m.label}</span>
                  <span style={{ color: 'var(--text-muted)', marginRight: 'auto', fontSize: '0.72rem' }}>
                    {i === 0 ? 'الافتراضي' : `Fallback ${i}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-section" style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              💡 يمكنك تغيير الـ model مباشرة من داخل نافذة الـ Chat.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            حسناً
          </button>
        </div>
      </div>
    </div>
  );
}
