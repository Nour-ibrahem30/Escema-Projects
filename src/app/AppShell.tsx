import { useMemo, useState, useEffect, useRef } from 'react';
import { SchemaExplorer }         from '../components/SchemaExplorer';
import { ValidationPanel }        from '../components/ValidationPanel';
import { EntityInspector }        from '../components/EntityInspector';
import { RelationshipInspector }  from '../components/RelationshipInspector';
import { DiagramCanvas }          from '../components/DiagramCanvas';
import { EnumManager }            from '../components/EnumManager';
import { IndexConstraintManager } from '../components/IndexConstraintManager';
import { ExportPanel }            from '../components/ExportPanel';
import { MigrationPanel }         from '../components/MigrationPanel';
import { ImportPanel }            from '../components/ImportPanel';
import { AIChatModal }            from '../components/AIChatModal';
import { AILintPanel }            from '../components/AILintPanel';
import { SeedDataPanel }          from '../components/SeedDataPanel';
import { QueryBuilderPanel }      from '../components/QueryBuilderPanel';
import { SchemaTabs }             from '../components/SchemaTabs';
import { SchemaGuideModal }       from '../components/SchemaGuideModal';
import { GitHubRepoModal }        from '../components/GitHubRepoModal';
import { ErrorBoundary }          from '../components/ErrorBoundary';
import { AICommandBar }           from '../components/AICommandBar';
import { SchemaHistoryPanel }     from '../components/SchemaHistoryPanel';
import { useSchemaStore }         from '../stores/schemaStore';
import { useAuthStore }           from '../stores/authStore';
import { useMultiSchemaStore }    from '../stores/multiSchemaStore';
import { useSchemaHistoryStore }  from '../stores/schemaHistoryStore';
import { encodeSchemaToURL, decodeSchemaFromURL, clearSchemaFromURL } from '../utils/shareSchema';
import { getStoredTheme, applyTheme, toggleTheme } from '../utils/theme';

type RightTab =
  | 'inspector' | 'lint'
  | 'enums' | 'indexes'
  | 'export' | 'migration' | 'import'
  | 'seed' | 'query' | 'history';

const TAB_GROUPS: { label: string; tabs: { id: RightTab; label: string }[] }[] = [
  {
    label: 'Schema',
    tabs: [
      { id: 'inspector', label: '🔍 Inspector' },
      { id: 'enums',     label: '🏷 Enums' },
      { id: 'indexes',   label: '⚡ Indexes' },
    ],
  },
  {
    label: 'AI',
    tabs: [
      { id: 'lint',    label: '🔎 Review' },
      { id: 'seed',    label: '🌱 Seed' },
      { id: 'query',   label: '🗃 Query' },
      { id: 'history', label: '🕐 History' },
    ],
  },
  {
    label: 'Tools',
    tabs: [
      { id: 'export',    label: '📤 Export' },
      { id: 'migration', label: '🔄 Migration' },
      { id: 'import',    label: '📥 Import' },
    ],
  },
];

export function AppShell() {
  const schema               = useSchemaStore((s) => s.schema);
  const validation           = useSchemaStore((s) => s.validation);
  const selectedEntityId     = useSchemaStore((s) => s.selectedEntityId);
  const selectedRelId        = useSchemaStore((s) => s.selectedRelationshipId);

  const addEntity              = useSchemaStore((s) => s.addEntity);
  const deleteEntity           = useSchemaStore((s) => s.deleteEntity);
  const addField               = useSchemaStore((s) => s.addField);
  const addRelationship        = useSchemaStore((s) => s.addRelationship);
  const addManyToMany          = useSchemaStore((s) => s.addManyToManyRelationship);
  const selectEntity           = useSchemaStore((s) => s.selectEntity);
  const selectRelationship     = useSchemaStore((s) => s.selectRelationship);
  const undo                   = useSchemaStore((s) => s.undo);
  const redo                   = useSchemaStore((s) => s.redo);
  const canUndo                = useSchemaStore((s) => s.canUndo);
  const canRedo                = useSchemaStore((s) => s.canRedo);
  const initSchema             = useSchemaStore((s) => s.initSchema);
  const loadSchema             = useSchemaStore((s) => s.loadSchema);

  const { user, signOut }           = useAuthStore();
  const { tabs, activeTabId, saveTabToCloud, updateTabSchema } = useMultiSchemaStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Track previous activeTabId to detect tab switches (not just schema edits)
  const prevActiveTabIdRef = useRef<string>('');

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus]     = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tab switch: load the new tab's schema into schemaStore ──────────────
  useEffect(() => {
    if (!activeTabId) return;
    // Only trigger when the active tab actually changes, not on every schema edit
    if (prevActiveTabIdRef.current === activeTabId) return;
    prevActiveTabIdRef.current = activeTabId;

    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    // Load this tab's schema into the working schemaStore
    loadSchema(tab.schema);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // ── Schema edit: keep multiSchemaStore tab in sync ──────────────────────
  useEffect(() => {
    if (!activeTabId) return;
    // Don't sync back during a tab switch (prev ref won't match yet)
    if (prevActiveTabIdRef.current !== activeTabId) return;
    updateTabSchema(activeTabId, schema);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // Auto-save to cloud 2 seconds after any schema change
  useEffect(() => {
    if (!user || !activeTabId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveTabToCloud(activeTabId);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, user, activeTabId]);
  const [rightTab, setRightTab]    = useState<RightTab>('inspector');
  const [guideOpen, setGuideOpen]  = useState(false);
  const [chatOpen, setChatOpen]    = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [guideLang, setGuideLang] = useState<'ar' | 'en' | undefined>(undefined);
  const [theme, setTheme]         = useState(getStoredTheme);
  const [shareToast, setShareToast] = useState('');

  // Apply theme on mount and changes
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Load schema from URL if present on first mount
  useEffect(() => {
    const shared = decodeSchemaFromURL();
    if (shared) {
      loadSchema(shared);
      clearSchemaFromURL();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectEntity = (id: string | null) => {
    selectEntity(id);
    if (id) setRightTab('inspector');
  };
  const handleSelectRelationship = (id: string) => {
    selectRelationship(id);
    setRightTab('inspector');
  };

  const selectedEntity = useMemo(
    () => schema.entities.find((e) => e.id === selectedEntityId) ?? null,
    [schema.entities, selectedEntityId],
  );
  const selectedRelationship = useMemo(
    () => schema.relationships.find((r) => r.id === selectedRelId) ?? null,
    [schema.relationships, selectedRelId],
  );

  const handleSeedDemo = () => {
    initSchema('E-Commerce', 'Online shopping platform demo');
    addEntity('User', 'Application user accounts');
    addEntity('Product', 'Products available for purchase');
    addEntity('Order', 'Customer orders');
    const s = useSchemaStore.getState().schema;
    const user    = s.entities.find((e) => e.name === 'User');
    const product = s.entities.find((e) => e.name === 'Product');
    const order   = s.entities.find((e) => e.name === 'Order');
    if (user) {
      addField(user.id, 'email',  'string',  { unique: true, nullable: false });
      addField(user.id, 'name',   'string',  { nullable: false });
      addField(user.id, 'role',   'string',  { nullable: false });
    }
    if (product) {
      addField(product.id, 'title', 'string',  { nullable: false });
      addField(product.id, 'price', 'decimal', { nullable: false });
      addField(product.id, 'stock', 'integer', { nullable: false });
    }
    if (order && user) {
      addField(order.id, 'total',      'decimal', { nullable: false });
      addField(order.id, 'status',     'string',  { nullable: false });
      addField(order.id, 'customerId', 'uuid',    { nullable: false });
      addRelationship(user.id, order.id, 'one-to-many');
    }
    if (product && user) addManyToMany(product.id, user.id, 'WishlistItem');
  };

  const handleShare = async () => {
    const url = encodeSchemaToURL(schema);
    await navigator.clipboard.writeText(url);
    setShareToast('🔗 Link copied to clipboard!');
    setTimeout(() => setShareToast(''), 3000);
  };

  const handleThemeToggle = () => {
    setTheme(toggleTheme());
  };

  const errorCount = validation.errors.length;
  const hasSchema  = schema.entities.length > 0;
  const historyCount = useSchemaHistoryStore((s) => s.entries.length);

  return (
    <div className="app-shell" data-theme={theme}>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="header-logo">
            <div className="header-logo-icon">⬡</div>
            <h1>Schema<span style={{ color: 'var(--brand-400)' }}>AI</span></h1>
          </div>
          <div className="header-divider" />
          <p className="subtitle">{schema.name} · <span style={{ opacity: 0.6 }}>v{schema.version}</span></p>
        </div>
        <div className="toolbar">
          {hasSchema && (
            <button
              type="button"
              className="chat-open-btn"
              onClick={() => setChatOpen(true)}
              title="Open AI Chat"
            >
              💬 AI Chat
            </button>
          )}
          {hasSchema && (
            <button type="button" className="guide-open-btn" onClick={() => setGuideOpen(true)}>
              📖 {guideLang === 'ar' ? 'شرح الـ Schema' : 'Schema Guide'}
            </button>
          )}
          {(() => {
            const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
            const provider  = (user?.app_metadata?.provider as string | undefined) ?? '';
            const hasGitHub = providers.includes('github') || provider === 'github';
            return hasGitHub ? (
              <button
                type="button"
                className="github-import-btn"
                onClick={() => setGithubOpen(true)}
                title="Import schema from GitHub repo"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                Import from GitHub
              </button>
            ) : null;
          })()}
          {hasSchema && (
            <button type="button" className="btn-secondary" onClick={handleShare} title="Share schema via URL">
              🔗 Share
            </button>
          )}
          <button type="button" onClick={handleSeedDemo}>Load Demo</button>
          <button type="button" onClick={() => addEntity('NewEntity')}>+ Entity</button>
          <button type="button" onClick={undo} disabled={!canUndo()}>Undo</button>
          <button type="button" onClick={redo} disabled={!canRedo()}>Redo</button>
          {selectedEntityId && (
            <button type="button" className="danger" onClick={() => deleteEntity(selectedEntityId)}>
              Delete Entity
            </button>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={handleThemeToggle}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>

          {/* Save status indicator */}
          {user && (
            <div className={`save-status save-status--${saveStatus}`} title="Cloud save status">
              {saveStatus === 'saving' && <><span className="spin">⟳</span> Saving…</>}
              {saveStatus === 'saved'  && <>✓ Saved</>}
              {saveStatus === 'error'  && <>✕ Save failed</>}
              {saveStatus === 'idle' && activeTab?.lastSaved && (
                <span className="save-status--idle">☁ Synced</span>
              )}
            </div>
          )}

          {/* User menu */}
          {user && (
            <div className="user-menu-wrapper">
              <button
                type="button"
                className="user-avatar-btn"
                onClick={() => setUserMenuOpen((v) => !v)}
                title={user.email ?? ''}
              >
                {user.user_metadata?.full_name
                  ? user.user_metadata.full_name.charAt(0).toUpperCase()
                  : (user.email ?? 'U').charAt(0).toUpperCase()}
              </button>

              {userMenuOpen && (
                <div className="user-menu" onClick={() => setUserMenuOpen(false)}>
                  <div className="user-menu-info">
                    <span className="user-menu-name">
                      {user.user_metadata?.full_name ?? 'User'}
                    </span>
                    <span className="user-menu-email">{user.email}</span>
                  </div>
                  <div className="user-menu-divider" />
                  <button
                    type="button"
                    className="user-menu-item danger"
                    onClick={async () => { setUserMenuOpen(false); await signOut(); }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Share toast */}
      {shareToast && <div className="share-toast">{shareToast}</div>}

      {/* Schema tabs */}
      <SchemaTabs />

      {/* ── 3-column layout ── */}
      <main className="app-main">
        <ErrorBoundary>
          <SchemaExplorer
            schema={schema}
            selectedEntityId={selectedEntityId}
            selectedRelationshipId={selectedRelId}
            onSelectEntity={handleSelectEntity}
            onSelectRelationship={handleSelectRelationship}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <DiagramCanvas />
        </ErrorBoundary>

        {/* Right panel */}
        <aside className="right-panel">
          {/* Grouped tabs */}
          <div className="right-tabs-grouped">
            {TAB_GROUPS.map((group) => (
              <div key={group.label} className="right-tab-group">
                <span className="right-tab-group-label">{group.label}</span>
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`right-tab${rightTab === tab.id ? ' active' : ''}`}
                    onClick={() => setRightTab(tab.id)}
                  >
                    {tab.label}
                    {tab.id === 'inspector' && errorCount > 0 && (
                      <span className="tab-error-badge">{errorCount}</span>
                    )}
                    {tab.id === 'history' && historyCount > 0 && (
                      <span className="tab-history-badge">{historyCount}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="right-tab-content">
            {rightTab === 'inspector' && (
              <ErrorBoundary>
                {selectedRelationship
                  ? <RelationshipInspector relationship={selectedRelationship} schema={schema} />
                  : <EntityInspector entity={selectedEntity} />}
                <ValidationPanel validation={validation} />
              </ErrorBoundary>
            )}
            {rightTab === 'lint'      && <ErrorBoundary><AILintPanel /></ErrorBoundary>}
            {rightTab === 'seed'      && <ErrorBoundary><SeedDataPanel /></ErrorBoundary>}
            {rightTab === 'query'     && <ErrorBoundary><QueryBuilderPanel /></ErrorBoundary>}
            {rightTab === 'enums'     && <ErrorBoundary><EnumManager /></ErrorBoundary>}
            {rightTab === 'indexes'   && <ErrorBoundary><IndexConstraintManager schema={schema} /></ErrorBoundary>}
            {rightTab === 'export'    && <ErrorBoundary><ExportPanel /></ErrorBoundary>}
            {rightTab === 'migration' && <ErrorBoundary><MigrationPanel /></ErrorBoundary>}
            {rightTab === 'import'    && <ErrorBoundary><ImportPanel /></ErrorBoundary>}
            {rightTab === 'history'   && <ErrorBoundary><SchemaHistoryPanel /></ErrorBoundary>}
          </div>
        </aside>
      </main>

      {/* AI Command Bar */}
      <ErrorBoundary>
        <AICommandBar
          onSchemaGenerated={(lang) => {
            setGuideLang(lang);
            setTimeout(() => setGuideOpen(true), 400);
          }}
        />
      </ErrorBoundary>

      {/* GitHub Repo Modal */}
      <GitHubRepoModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
      />

      {/* Chat Modal */}
      <AIChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      {/* Guide Modal */}
      <SchemaGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        schema={schema}
        lang={guideLang}
      />
    </div>
  );
}
