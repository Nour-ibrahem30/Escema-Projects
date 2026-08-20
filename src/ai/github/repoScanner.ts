/**
 * Repository Scanner
 * Filters, classifies, and sanitizes files from a GitHub repo tree.
 */
import type { GitHubFile } from '../../lib/github.service';

// ─── File Classification ──────────────────────────────────────────────────────

export type FileClass =
  | 'prisma'       // highest priority — direct schema
  | 'sql'          // SQL migrations / schema files
  | 'orm-model'    // TypeORM, Sequelize, Django, Rails, Laravel models
  | 'config'       // package.json, tsconfig, etc.
  | 'source'       // general source files
  | 'test'         // test files
  | 'generated'    // dist, build, compiled output
  | 'asset'        // images, fonts, binaries
  | 'secret'       // .env, credentials — must be masked
  | 'ignored';     // lock files, node_modules, etc.

export type ClassifiedFile = GitHubFile & {
  classification: FileClass;
  priority: number;       // lower = more important
  language: string | null;
  isMasked: boolean;      // true if content should be sanitised
};

// ─── Ignore Patterns ─────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.cache', '.turbo', 'vendor', 'target',
  '__pycache__', '.pytest_cache', '.mypy_cache',
  'public/static', 'public/assets',
  '.venv', 'venv', 'env',
]);

const IGNORED_EXTENSIONS = new Set([
  '.lock', '.map', '.snap', '.DS_Store',
  // Compiled
  '.pyc', '.pyo', '.class', '.o', '.a', '.so', '.dll', '.exe',
  // Minified
  '.min.js', '.min.css',
  // Assets
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz',
  '.woff', '.woff2', '.ttf', '.eot',
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', 'Gemfile.lock', 'Cargo.lock', 'poetry.lock',
  '.gitignore', '.eslintignore', '.prettierignore',
  'CHANGELOG.md', 'LICENSE', 'LICENSE.md',
]);

// ─── Secret Patterns ─────────────────────────────────────────────────────────

const SECRET_FILE_PATTERNS = [
  /^\.env(\.\w+)?$/,
  /credentials\.(json|yaml|yml)$/i,
  /secrets?\.(json|yaml|yml)$/i,
  /\.pem$/, /\.key$/, /\.cert$/, /\.p12$/, /id_rsa/, /id_ed25519/,
];

const SECRET_CONTENT_PATTERNS = [
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*=\s*\S+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/g,
];

export function maskSecrets(content: string): string {
  let masked = content;
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const eqIdx = match.indexOf('=');
      if (eqIdx !== -1) {
        return match.slice(0, eqIdx + 1) + ' [REDACTED]';
      }
      return '[REDACTED]';
    });
  }
  return masked;
}

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.java': 'java',
  '.cs': 'csharp', '.php': 'php', '.rs': 'rust', '.kt': 'kotlin',
  '.swift': 'swift', '.sql': 'sql', '.prisma': 'prisma',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.graphql': 'graphql', '.gql': 'graphql',
  '.dart': 'dart', '.ex': 'elixir', '.exs': 'elixir',
};

function getExtension(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx === -1) return '';
  return base.slice(dotIdx).toLowerCase();
}

function getLanguage(path: string): string | null {
  return EXT_TO_LANG[getExtension(path)] ?? null;
}

// ─── Classification logic ─────────────────────────────────────────────────────

function classify(file: GitHubFile): FileClass {
  const p    = file.path.toLowerCase();
  const base = (file.path.split('/').pop() ?? '').toLowerCase();
  const ext  = getExtension(file.path);
  const dirs = file.path.split('/');

  // Ignored dirs
  if (dirs.some((d) => IGNORED_DIRS.has(d.toLowerCase()))) return 'ignored';

  // Ignored files
  if (IGNORED_FILES.has(base)) return 'ignored';

  // Ignored extensions
  if (IGNORED_EXTENSIONS.has(ext)) return 'asset';

  // Secrets
  if (SECRET_FILE_PATTERNS.some((re) => re.test(base))) return 'secret';

  // Generated
  if (/\/(dist|build|out|\.next|\.nuxt|compiled)\//.test(p)) return 'generated';
  if (/\.(min\.js|min\.css|bundle\.js)$/.test(p)) return 'generated';

  // Tests
  if (/\.(test|spec)\.(ts|tsx|js|jsx|py|rb|go)$/.test(p)) return 'test';
  if (/\/(tests?|__tests__|spec|specs)\//.test(p)) return 'test';
  if (/\.(test|spec)$/.test(base)) return 'test';

  // Prisma
  if (ext === '.prisma') return 'prisma';

  // SQL
  if (ext === '.sql') return 'sql';

  // ORM models
  if (
    /\/models?\/.*\.(ts|tsx|js|py|rb|php|java|cs|kt)$/.test(p) ||
    /\/entities?\/.*\.(ts|tsx|js)$/.test(p) ||
    /\/migrations?\/.*\.(ts|js|py|rb|sql)$/.test(p) ||
    /db\/schema\.(rb|ts|js)$/.test(p) ||
    /database\/migrations\//.test(p)
  ) return 'orm-model';

  // Config
  if (
    base === 'package.json' || base === 'tsconfig.json' ||
    base === 'requirements.txt' || base === 'pyproject.toml' ||
    base === 'gemfile' || base === 'cargo.toml' || base === 'go.mod' ||
    ext === '.yaml' || ext === '.yml' || ext === '.toml'
  ) return 'config';

  // Source
  const srcExts = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go',
    '.java', '.cs', '.php', '.rs', '.kt', '.swift', '.dart',
    '.ex', '.exs', '.graphql', '.gql',
  ]);
  if (srcExts.has(ext)) return 'source';

  return 'ignored';
}

// Priority map
const CLASS_PRIORITY: Record<FileClass, number> = {
  prisma: 1, sql: 2, 'orm-model': 3, config: 4,
  source: 5, test: 8, generated: 9, asset: 10,
  secret: 10, ignored: 99,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export type ScanResult = {
  files: ClassifiedFile[];
  stats: {
    total: number;
    included: number;
    ignored: number;
    secrets: number;
    byClass: Record<FileClass, number>;
  };
};

export function scanRepo(files: GitHubFile[], maxSizeBytes = 400_000): ScanResult {
  const classified: ClassifiedFile[] = [];
  const stats: ScanResult['stats'] = {
    total: files.length, included: 0, ignored: 0, secrets: 0,
    byClass: {} as Record<FileClass, number>,
  };

  for (const file of files) {
    const cls = classify(file);

    // Count all
    stats.byClass[cls] = (stats.byClass[cls] ?? 0) + 1;

    if (cls === 'ignored' || cls === 'asset' || cls === 'generated' || cls === 'test') {
      stats.ignored++;
      continue;
    }
    if (file.size > maxSizeBytes) { stats.ignored++; continue; }

    // Use detected language or fall back to 'source' so files aren't silently dropped
    const detectedLang = getLanguage(file.path);
    const effectiveLang = detectedLang ?? (cls === 'source' ? 'source' : null);

    classified.push({
      ...file,
      classification: cls,
      priority: CLASS_PRIORITY[cls],
      language: effectiveLang,
      isMasked: cls === 'secret',
    });

    if (cls === 'secret') stats.secrets++;
    else stats.included++;
  }

  // Sort by priority
  classified.sort((a, b) => a.priority - b.priority);

  return { files: classified, stats };
}
