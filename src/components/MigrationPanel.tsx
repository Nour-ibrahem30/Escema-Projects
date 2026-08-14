import { useState, useEffect } from 'react';
import { diffSchemas } from '../core/migrations/generator';
import { useSchemaStore } from '../stores/schemaStore';
import type { SchemaModel } from '../types';

export function MigrationPanel() {
  const schema  = useSchemaStore((s) => s.schema);
  const history = useSchemaStore((s) => s.history);

  const [baseIndex, setBaseIndex] = useState(0);
  const [copied, setCopied]       = useState(false);

  // Pick the snapshot to diff against — default to the earliest in history
  useEffect(() => {
    setBaseIndex(0);
  }, [history.length]);

  if (history.length < 2) {
    return (
      <div className="inspector-empty">
        <p>Make at least one change to the schema to generate a migration.</p>
      </div>
    );
  }

  const baseSnapshot: SchemaModel  = history[baseIndex]?.schema ?? history[0]!.schema;
  const result = diffSchemas(baseSnapshot, schema);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([result.sql], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `migration_${Date.now()}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="migration-panel">
      <div className="inspector-section-header">
        <h3>Migration Generator</h3>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button type="button" className="btn-secondary" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleDownload}>
            Download
          </button>
        </div>
      </div>

      {/* Baseline selector */}
      <div className="migration-base-row">
        <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          Compare with version:
          <select
            className="form-select"
            value={baseIndex}
            onChange={(e) => setBaseIndex(Number(e.target.value))}
            style={{ flex: 1 }}
          >
            {history.map((snap, i) => (
              <option key={i} value={i}>
                v{i + 1} — {new Date(snap.timestamp).toLocaleTimeString()}
                {i === 0 ? ' (initial)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Summary */}
      {result.changes.length === 0 ? (
        <p className="empty">No changes detected since selected version.</p>
      ) : (
        <>
          <div className="migration-summary">
            {result.summary.map((line, i) => (
              <div
                key={i}
                className={`migration-change ${
                  line.startsWith('+') ? 'add' : line.startsWith('-') ? 'drop' : 'alter'
                }`}
              >
                {line}
              </div>
            ))}
          </div>
          <pre className="export-code">{result.sql}</pre>
        </>
      )}
    </div>
  );
}
