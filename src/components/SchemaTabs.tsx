import { useState } from 'react';
import { useMultiSchemaStore } from '../stores/multiSchemaStore';
import { useAuthStore } from '../stores/authStore';

export function SchemaTabs() {
  const { tabs, activeTabId, newTab, closeTab, switchTab, duplicateTab, renameTab, deleteTabFromCloud } =
    useMultiSchemaStore();
  const { user } = useAuthStore();

  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editValue, setEditValue]       = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setEditValue(current);
  };

  const commitRename = (id: string) => {
    if (editValue.trim()) renameTab(id, editValue.trim());
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    // If only one tab — just close (it resets to fresh tab internally)
    if (tabs.length === 1) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const tab = tabs.find((t) => t.id === confirmDeleteId);
    setConfirmDeleteId(null);
    if (!tab) return;

    if (user && tab.remoteId) {
      // Logged in + saved to cloud → delete from cloud (also closes the tab)
      await deleteTabFromCloud(confirmDeleteId);
    } else {
      // Not saved to cloud yet → just close locally
      closeTab(confirmDeleteId);
    }
  };

  return (
    <>
      <div className="schema-tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`schema-tab${tab.id === activeTabId ? ' active' : ''}`}
          >
            {editingId === tab.id ? (
              <input
                className="schema-tab-input"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(tab.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="schema-tab-label"
                onClick={() => switchTab(tab.id)}
                onDoubleClick={() => startRename(tab.id, tab.label)}
                title="Double-click to rename"
              >
                {tab.label}
                {tab.schema.entities.length > 0 && (
                  <span className="schema-tab-count">{tab.schema.entities.length}</span>
                )}
              </button>
            )}

            <div className="schema-tab-actions">
              <button
                type="button"
                className="schema-tab-btn"
                title="Duplicate"
                onClick={() => duplicateTab(tab.id)}
              >⧉</button>
              <button
                type="button"
                className="schema-tab-btn close"
                title={user && tab.remoteId ? 'Delete from cloud' : 'Close tab'}
                onClick={() => handleDelete(tab.id)}
              >🗑</button>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="schema-tab-new"
          onClick={() => newTab()}
          title="New schema tab"
        >
          ＋
        </button>
      </div>

      {/* Confirm delete dialog */}
      {confirmDeleteId && (() => {
        const tab = tabs.find((t) => t.id === confirmDeleteId);
        return (
          <div className="confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Delete "{tab?.label}"?</h3>
              <p>
                {user && tab?.remoteId
                  ? 'This will permanently delete the schema from the cloud. This cannot be undone.'
                  : 'This will close the tab and remove all unsaved work.'}
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={confirmDelete}
                >
                  {user && tab?.remoteId ? 'Delete permanently' : 'Close tab'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
