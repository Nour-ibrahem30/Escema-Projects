/**
 * GitHub Service — fetches repos and files using the user's GitHub OAuth token.
 * The token comes from Supabase session (provider_token) after GitHub OAuth login.
 */
import { supabase } from './supabase';

const GITHUB_API = 'https://api.github.com';

// ─── Get GitHub token from current Supabase session ──────────────────────────

export async function getGitHubToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
  default_branch: string;
};

export type GitHubFile = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
};

// ─── Fetch user's repositories ────────────────────────────────────────────────

export async function fetchRepos(token: string): Promise<GitHubRepo[]> {
  const results: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    );

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json() as GitHubRepo[];
    if (data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return results;
}

// ─── Fetch repo file tree ─────────────────────────────────────────────────────

export async function fetchRepoTree(
  token: string,
  fullName: string,
  branch: string,
): Promise<GitHubFile[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/git/trees/${branch}?recursive=1`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  );

  if (!res.ok) throw new Error(`Failed to fetch repo tree: ${res.status}`);
  const data = await res.json() as { tree: Array<{ path: string; type: string; size: number; sha: string }> };

  return data.tree
    .filter((f) => f.type === 'blob')
    .map((f) => ({
      name: f.path.split('/').pop() ?? f.path,
      path: f.path,
      type: 'file' as const,
      size: f.size,
      sha: f.sha,
    }));
}

// ─── Fetch file content ───────────────────────────────────────────────────────

export async function fetchFileContent(
  token: string,
  fullName: string,
  path: string,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${fullName}/contents/${encodeURIComponent(path)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  );

  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const data = await res.json() as { content: string; encoding: string };

  if (data.encoding === 'base64') {
    return atob(data.content.replace(/\n/g, ''));
  }
  return data.content;
}

// ─── Smart file picker — finds schema-relevant files ─────────────────────────

const SCHEMA_FILES = [
  // Prisma
  'prisma/schema.prisma', 'schema.prisma',
  // SQL
  'schema.sql', 'database.sql', 'migrations/001_initial.sql',
  'db/schema.sql', 'sql/schema.sql',
  // Package info
  'package.json',
  // Django / Rails / Laravel models (dirs)
  'models.py', 'db/schema.rb', 'database/migrations',
  // TypeORM / Sequelize
  'src/entities', 'src/models', 'entities', 'models',
];

const SCHEMA_PATTERNS = [
  /prisma\/.*\.prisma$/,
  /schema\.prisma$/,
  /\.sql$/,
  /migrations\/.*\.sql$/,
  /models?\//,
  /entities?\//,
  /^package\.json$/,
  /drizzle\.config\./,
];

export function pickSchemaFiles(files: GitHubFile[]): GitHubFile[] {
  const priority: GitHubFile[] = [];
  const secondary: GitHubFile[] = [];

  for (const file of files) {
    if (file.size > 500_000) continue; // skip huge files

    const isExact = SCHEMA_FILES.some(
      (s) => file.path === s || file.path.endsWith(`/${s}`),
    );

    if (isExact) {
      priority.push(file);
      continue;
    }

    const isPattern = SCHEMA_PATTERNS.some((p) => p.test(file.path));
    if (isPattern) secondary.push(file);
  }

  // Return up to 15 files total — priority first
  return [...priority, ...secondary].slice(0, 15);
}
