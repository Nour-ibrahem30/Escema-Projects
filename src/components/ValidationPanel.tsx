import type { ValidationResult } from '../types';

type Props = {
  validation: ValidationResult;
};

export function ValidationPanel({ validation }: Props) {
  const total =
    validation.errors.length +
    validation.warnings.length +
    validation.suggestions.length;

  if (total === 0) {
    return (
      <div className="validation-panel">
        <p className="validation-ok">✓ No issues found</p>
      </div>
    );
  }

  return (
    <div className="validation-panel">
      <div className="inspector-section-header" style={{ marginTop: '0.75rem' }}>
        <h3>Validation</h3>
        <span className="meta">{total} issue{total !== 1 ? 's' : ''}</span>
      </div>

      {validation.errors.map((issue, i) => (
        <div key={i} className="validation-issue error">
          <span className="issue-icon">✕</span>
          <div>
            <span className="issue-code">{issue.code}</span>
            <span className="issue-msg">{issue.message}</span>
          </div>
        </div>
      ))}

      {validation.warnings.map((issue, i) => (
        <div key={i} className="validation-issue warning">
          <span className="issue-icon">⚠</span>
          <div>
            <span className="issue-code">{issue.code}</span>
            <span className="issue-msg">{issue.message}</span>
          </div>
        </div>
      ))}

      {validation.suggestions.map((issue, i) => (
        <div key={i} className="validation-issue suggestion">
          <span className="issue-icon">💡</span>
          <div>
            <span className="issue-code">{issue.code}</span>
            <span className="issue-msg">{issue.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
