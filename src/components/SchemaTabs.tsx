import { useState } from 'react';
import { useMultiSchemaStore } from '../stores/multiSchemaStore';

export function SchemaTabs() {
  const { tabs, activeTabId, newTab, closeTab, switchTab, duplicateTab, renameTab } =
    useMultiSchemaStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setEditValue(current);
  };

  const commitRename = (id: string) => {
    if (editValue.trim()) renameTab(id, editValue.trim());
    setEditingId(null);
  };

  return (
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
            {tabs.length > 1 && (
              <button
                type="button"
                className="schema-tab-btn close"
                title="Close"
                onClick={() => closeTab(tab.id)}
              >✕</button>
            )}
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
  );
}
