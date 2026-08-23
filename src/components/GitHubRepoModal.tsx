import { useState, useEffect, useCallback } from 'react';
import {
  getGitHubToken,
  fetchRepos,
  fetchRepoTree,
  fetchFileContent,
  type GitHubRepo,
} from '../lib/github.service';
import { generateSchemaFromRepo, type AnalysisProgress } from '../ai/githubAnalyzer';
import { useSchemaStore }      from '../stores/schemaStore';
import { useMultiSchemaStore } from '../stores/multiSchemaStore';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Step = 'repos' | 'analyzing' | 'done' | 'error' | 'no-token';

const STAGE_LABELS: Record<string, string> = {
  'scanning':        '🔍 Scanning repository',
  'static-analysis': '⚙ Static analysis (no AI)',
  'cache-lookup':    '⚡ Checking cache',
  'batching':        '📦 Creating AI batches',
  'ai-analysis':     '🤖 AI analysis',
  'merging':         '🔀 Merging results',
  'building':        '🏗 Building schema',
  'done':            '✅ Done',
};

export function GitHubRepoModal({ open, onClose }: Props) {
  const loadSchema      = useSchemaStore((s) => s.loadSchema);
  const activeTabId     = useMultiSchemaStore((s) => s.activeTabId);
  const updateTabSchema = useMultiSchemaStore((s) => s.updateTabSchema);

  const [step, setStep]               = useState<Step>('repos');
  const [token, setToken]             = useState<string | null>(null);
  const [repos, setRepos]             = useState<GitHubRepo[]>([]);
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [progress, setProgress]       = useState<AnalysisProgress | null>(null);
  const [warnings, setWarnings]       = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const t = await getGitHubToken();
      if (!t) { setStep('no-token'); return; }
      setToken(t);
      const list = await fetchRepos(t);
      setRepos(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setStep('repos');
      setSearch('');
      setError('');
      setProgress(null);
      setWarnings([]);
      load();
    }
  }, [open, load]);

  const handleSelectRepo = async (repo: GitHubRepo) => {
    if (!token) return;
    setSelectedRepo(repo);
    setStep('analyzing');
    setError('');
    setProgress(null);
    setWarnings([]);

    try {
      // Fetch the file tree
      setProgress({
        stage: 'scanning',
        message: `Fetching file tree for ${repo.name}…`,
        percent: 3,
      });

      const tree = await fetchRepoTree(token, repo.full_name, repo.default_branch);

      const schema = await generateSchemaFromRepo(
        repo.full_name,
        repo.name,
        repo.description ?? '',
        tree,
        (path) => fetchFileContent(token, repo.full_name, path),
        {
          onProgress: (p) => setProgress(p),
          onWarning:  (msg) => setWarnings((w) => [...w, msg]),
        },
      );

      loadSchema(schema);
      // Sync the generated schema into the active tab so the canvas shows it
      if (activeTabId) updateTabSchema(activeTabId, schema);
      setStep('done');
      setTimeout(() => onClose(), 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setStep('error');
    }
  };

  if (!open) return null;

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="github-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Import from GitHub"
      >
        {/* Header */}
        <div className="github-modal-header">
          <div className="github-modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-primary)' }}>
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            Import from GitHub
          </div>
          <button type="button" className="guide-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="github-modal-body">

          {/* No GitHub token */}
          {step === 'no-token' && (
            <div className="github-empty">
              <div style={{ fontSize: '2rem' }}>🔑</div>
              <h3>GitHub access required</h3>
              <p>Sign out and sign back in using <strong>GitHub</strong> to connect your repositories.</p>
            </div>
          )}

          {/* Repo list */}
          {(step === 'repos' || step === 'error') && (
            <>
              <div className="github-search-row">
                <input
                  type="text"
                  className="github-search"
                  placeholder="Search repositories…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {error && (
                <div className="command-error" style={{ borderRadius: 'var(--radius-md)', margin: '0 1.25rem 0.75rem' }}>
                  <span>✕</span><span>{error}</span>
                </div>
              )}

              {loading ? (
                <div className="github-loading">
                  <span className="spin">⟳</span>
                  <span>Loading repositories…</span>
                </div>
              ) : (
                <div className="github-repo-list">
                  {filtered.length === 0 && (
                    <p className="empty" style={{ padding: '1rem', textAlign: 'center' }}>
                      No repositories found.
                    </p>
                  )}
                  {filtered.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      className="github-repo-item"
                      onClick={() => handleSelectRepo(repo)}
                    >
                      <div className="github-repo-info">
                        <span className="github-repo-name">
                          {repo.private && <span className="github-private-badge">Private</span>}
                          {repo.name}
                        </span>
                        {repo.description && (
                          <span className="github-repo-desc">{repo.description}</span>
                        )}
                        <div className="github-repo-meta">
                          {repo.language && (
                            <span className="github-lang">
                              <span className="github-lang-dot" />
                              {repo.language}
                            </span>
                          )}
                          <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                          {repo.stargazers_count > 0 && <span>⭐ {repo.stargazers_count}</span>}
                        </div>
                      </div>
                      <span className="github-repo-arrow">→</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Analyzing */}
          {step === 'analyzing' && (
            <div className="github-analysis-view">
              <div className="github-analysis-header">
                <div className="github-analyzing-icon">
                  <span className="spin" style={{ fontSize: '1.5rem', color: 'var(--brand-400)' }}>⟳</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Analyzing {selectedRepo?.name}
                  </h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Smart pipeline: static analysis → AI batches → merge
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              {progress && (
                <div className="github-analysis-progress">
                  <div className="github-progress-header">
                    <span className="github-stage-label">
                      {STAGE_LABELS[progress.stage] ?? progress.stage}
                    </span>
                    <span className="github-percent">{Math.min(progress.percent, 100)}%</span>
                  </div>
                  <div className="github-progress-bar-wrap">
                    <div
                      className="github-progress-bar-fill"
                      style={{ width: `${Math.min(progress.percent, 100)}%` }}
                    />
                  </div>
                  <p className="github-progress-msg">{progress.message}</p>

                  {/* Batch indicator */}
                  {progress.batchTotal !== undefined && progress.batchTotal > 0 && (
                    <div className="github-batch-dots">
                      {Array.from({ length: progress.batchTotal }).map((_, i) => (
                        <span
                          key={i}
                          className={`github-batch-dot ${
                            i < (progress.batchCompleted ?? 0) ? 'done'
                            : i === (progress.batchCompleted ?? 0) ? 'active'
                            : 'pending'
                          }`}
                        />
                      ))}
                      <span className="meta">
                        {progress.batchCompleted ?? 0}/{progress.batchTotal} batches
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings / info log */}
              {warnings.length > 0 && (
                <div className="github-warnings">
                  {warnings.slice(-6).map((w, i) => (
                    <div key={i} className="github-warning-row">
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>›</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="github-analyzing" style={{ gap: '0.75rem' }}>
              <div style={{ fontSize: '3rem' }}>✅</div>
              <h3 style={{ margin: 0 }}>Schema Generated!</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                Successfully built schema from <strong>{selectedRepo?.name}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="github-modal-footer">
          <span className="meta">
            {step === 'repos' && !loading && `${filtered.length} repositories`}
            {step === 'analyzing' && progress && `${Math.min(progress.percent, 100)}% complete`}
            {step === 'done' && 'Closing…'}
          </span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
