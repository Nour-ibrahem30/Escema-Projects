/**
 * Schema History Panel — shows all AI-generated schemas.
 * Lets the user restore a snapshot into a new tab or overwrite the current one.
 */
import { useState } from 'react';
import { useSchemaHistoryStore, type HistoryEntry } from '../stores/schemaHistoryStore';
import { useSchemaStore } from '../stores/schemaStore';
import { useMultiSchemaStore } from '../stores/multiSchemaStore';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function SchemaHistoryPanel() {
  const { entries, removeEntry, clearAll } = useSchemaHistoryStore();
  const loadSchema  = useSchemaStore((s) => s.loadSchema);
  const newTab      = useMultiSchemaStore((s) => s.newTab);
  const updateTabSchema = useMultiSchemaStore((s) => s.updateTabSchema);
  const activeTabId = useMultiSchemaStore((s) => s.activeTabId);

  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const handleRestoreInPlace = (entry: HistoryEntry) => {
    loadSchema(entry.snapshot);
    // Also update the current tab in multiSchemaStore
    if (activeTabId) updateTabSchema(activeTabId, entry.snapshot);
  };

  const handleRestoreNewTab = (entry: HistoryEntry) => {
    newTab(entry.schemaName);
    // newTab sets a new activeTabId — wait a tick then load
    setTimeout(() => {
      const { activeTabId: newId, updateTabSchema: update } = useMultiSchemaStore.getState();
      loadSchema(entry.snapshot);
      if (newId) update(newId, entry.snapshot);
    }, 0);
  };

  if (entries.length === 0) {
    return (
      <div className="history-empty">
        <div className="history-empty-icon">🕐</div>
        <p>No AI-generated schemas yet.</p>
        <p className="history-empty-hint">
          Use the AI bar below to generate a schema — it will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="history-panel">
      {/* Header */}
      <div className="history-panel-header">
        <span className="history-count">{entries.length} schema{entries.length !== 1 ? 's' : ''}</span>
        {!confirmClear ? (
          <button
            type="button"
            className="history-clear-btn"
            onClick={() => setConfirmClear(true)}
            title="Clear all history"
          >
            🗑 Clear all
          </button>
        ) : (
          <div className="history-confirm-clear">
            <span>Sure?</span>
            <button type="button" className="danger-sm" onClick={() => { clearAll(); setConfirmClear(false); }}>
              Yes, clear
            </button>
            <button type="button" className="cancel-sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Entries */}
      <div className="history-list">
        {entries.map((entry) => {
          const isExpanded = expandedId === entry.id;
          return (
            <div
              key={entry.id}
              className={`history-entry${isExpanded ? ' expanded' : ''}`}
            >
              {/* Main row */}
              <div
                className="history-entry-main"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedId(isExpanded ? null : entry.id)}
              >
                <div className="history-entry-left">
                  <span className="history-schema-name">{entry.schemaName}</span>
                  <span className="history-prompt" title={entry.prompt}>
                    {entry.prompt}
                  </span>
                </div>

                <div className="history-entry-right">
                  <div className="history-meta">
                    <span className="history-badge">{entry.entityCount} entities</span>
                    {entry.relationshipCount > 0 && (
                      <span className="history-badge">{entry.relationshipCount} rels</span>
                    )}
                  </div>
                  <span className="history-time">{timeAgo(entry.createdAt)}</span>
                  <span className={`history-chevron${isExpanded ? ' open' : ''}`}>›</span>
                </div>
              </div>

              {/* Expanded: entity list + actions */}
              {isExpanded && (
                <div className="history-entry-body">
                  {/* Entity preview */}
                  <div className="history-entities-preview">
                    {entry.snapshot.entities.slice(0, 8).map((e) => (
                      <span key={e.id} className="history-entity-chip">
                        {e.name}
                        <span className="history-entity-fields">{e.fields.length}</span>
                      </span>
                    ))}
                    {entry.snapshot.entities.length > 8 && (
                      <span className="history-entity-chip history-entity-more">
                        +{entry.snapshot.entities.length - 8} more
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="history-actions">
                    <button
                      type="button"
                      className="history-btn-restore"
                      onClick={() => handleRestoreInPlace(entry)}
                      title="Load into current tab"
                    >
                      ↩ Restore here
                    </button>
                    <button
                      type="button"
                      className="history-btn-newtab"
                      onClick={() => handleRestoreNewTab(entry)}
                      title="Open in a new tab"
                    >
                      ⊞ Open in new tab
                    </button>
                    <button
                      type="button"
                      className="history-btn-delete"
                      onClick={() => removeEntry(entry.id)}
                      title="Remove from history"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
