/**
 * GitHub Analyzer — Smart Pipeline
 *
 * Architecture:
 *   1. Scan + classify repo files
 *   2. Static analysis (Prisma/SQL/package.json parsed without AI)
 *   3. Cache lookup — skip unchanged files
 *   4. Token-aware batching
 *   5. Sequential AI analysis per batch with retry + fallback
 *   6. Merge all results
 *   7. Build final SchemaModel
 */
import { scanRepo, maskSecrets, type ClassifiedFile } from './github/repoScanner';
import { runStaticAnalysis, parsePackageJson }         from './github/staticAnalyzer';
import { createBatches }                               from './github/tokenBudget';
import { analyzeAllBatches }                           from './github/batchAnalyzer';
import { mergeResults }                                from './github/resultMerger';
import { repoCache }                                   from './github/repoCache';
import { applyAISchema }                               from './applySchema';
import { createEmptySchema }                           from '../core/schema/factory';
import {
  addEntity, addField, addRelationship,
  addEnum, addEnumValue, renameEntity,
} from '../core/schema';
import { createManyToManyJunction } from '../core/relationships';
import type { GitHubFile }          from '../lib/github.service';
import type { SchemaModel }         from '../types';
import type { AISchemaResponse }    from './engine';

// ─── Progress types ───────────────────────────────────────────────────────────

export type AnalysisStage =
  | 'scanning'
  | 'static-analysis'
  | 'cache-lookup'
  | 'batching'
  | 'ai-analysis'
  | 'merging'
  | 'building'
  | 'done';

export type AnalysisProgress = {
  stage: AnalysisStage;
  message: string;
  batchCompleted?: number;
  batchTotal?: number;
  percent: number;
};

export type AnalysisCallbacks = {
  onProgress: (p: AnalysisProgress) => void;
  onWarning?: (msg: string) => void;
};

// ─── Fake store for in-memory schema building ─────────────────────────────────

function buildFakeStore() {
  let schema: SchemaModel = createEmptySchema('Generated');

  return {
    get schema() { return schema; },
    initSchema: (name: string, desc?: string) => { schema = createEmptySchema(name, desc); },
    loadSchema: (s: SchemaModel) => { schema = s; },
    commitSchema: (s: SchemaModel) => { schema = s; },
    addEntity: (name: string, desc?: string) => { schema = addEntity(schema, name, { description: desc }); },
    addField: (
      entityId: string, name: string,
      type: import('../types').Field['type'],
      opts?: Partial<import('../types').Field>,
    ) => { schema = addField(schema, entityId, name, type, opts); },
    addRelationship: (
      src: string, tgt: string,
      type: import('../types').RelationshipType,
      opts?: Partial<import('../types').Relationship>,
    ) => { schema = addRelationship(schema, src, tgt, type, opts); },
    addManyToManyRelationship: (src: string, tgt: string) => {
      const result = createManyToManyJunction(schema, src, tgt);
      schema = result.schema;
    },
    addEnum:          (name: string) => { schema = addEnum(schema, name); },
    addEnumValue:     (eid: string, val: string) => { schema = addEnumValue(schema, eid, val); },
    renameEntity:     (id: string, name: string) => { schema = renameEntity(schema, id, name); },
    deleteEntity:     (_id: string) => {},
    deleteField:      (_eId: string, _fId: string) => {},
    updateField:      (_eId: string, _fId: string, _u: unknown) => {},
    updateRelationship: (_id: string, _u: unknown) => {},
    deleteRelationship: (_id: string) => {},
    deleteEnum:       (_id: string) => {},
    removeEnumValue:  (_eid: string, _v: string) => {},
    addIndex:         (_n: string, _eId: string, _fIds: string[], _u: boolean) => {},
    deleteIndex:      (_id: string) => {},
    selectEntity:     (_id: string | null) => {},
    selectRelationship: (_id: string) => {},
    undo: () => {}, redo: () => {},
    canUndo: () => false, canRedo: () => false,
    revalidate: () => {},
    history: [], historyIndex: 0,
    validation: { valid: true, errors: [], warnings: [], suggestions: [] },
    selectedEntityId: null, selectedRelationshipId: null,
  };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function generateSchemaFromRepo(
  repoFullName: string,
  repoName: string,
  repoDescription: string,
  tree: GitHubFile[],
  fetchContent: (path: string) => Promise<string>,
  callbacks: AnalysisCallbacks,
): Promise<SchemaModel> {
  const progress = (
    stage: AnalysisStage,
    message: string,
    percent: number,
    batchCompleted?: number,
    batchTotal?: number,
  ) => callbacks.onProgress({ stage, message, percent, batchCompleted, batchTotal });

  // ── Stage 1: Scan + classify ──────────────────────────────────────────────
  progress('scanning', `Scanning ${tree.length} files…`, 5);
  const { files: classified, stats } = scanRepo(tree);

  callbacks.onWarning?.(
    `Found ${stats.included} relevant files (${stats.ignored} ignored, ${stats.secrets} secrets masked)`,
  );

  if (classified.length === 0) {
    throw new Error(
      'No relevant source files found in this repository. ' +
      'Make sure the repo contains source code (.ts, .js, .py, .prisma, .sql, etc.) ' +
      'and is not only assets or generated files.',
    );
  }

  // ── Stage 2: Fetch file contents ──────────────────────────────────────────
  progress('scanning', `Reading ${classified.length} files…`, 10);

  const withContent: (ClassifiedFile & { content: string })[] = [];

  // Check cache first, fetch only what's needed
  const toFetch: ClassifiedFile[] = [];
  const cachedResults: (AISchemaResponse | null)[] = [];
  let cachedCount = 0;

  for (const file of classified) {
    // We need content to check cache — always fetch (content is base64 decoded)
    toFetch.push(file);
  }

  // Parallel fetch (max 5 concurrent)
  progress('cache-lookup', 'Fetching file contents…', 12);
  const FETCH_CONCURRENCY = 5;
  let fetchFailed = 0;
  for (let i = 0; i < toFetch.length; i += FETCH_CONCURRENCY) {
    const chunk = toFetch.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (file) => {
        let content = await fetchContent(file.path);
        if (file.isMasked) content = maskSecrets(content);
        return { file, content };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        withContent.push({ ...r.value.file, content: r.value.content });
      } else {
        fetchFailed++;
      }
    }
  }

  if (fetchFailed > 0) {
    callbacks.onWarning?.(`Failed to fetch ${fetchFailed} file(s) — they will be skipped`);
  }

  if (withContent.length === 0) {
    throw new Error(
      'Could not read any file contents from this repository. ' +
      'This may be a GitHub rate limit issue — try again in a few minutes.',
    );
  }

  // ── Stage 3: Cache lookup ─────────────────────────────────────────────────
  progress('cache-lookup', 'Checking cache for unchanged files…', 18);

  const needAI: typeof withContent = [];
  const staticFiles: { path: string; content: string; language: string | null }[] = [];

  for (const file of withContent) {
    const cached = repoCache.get(repoFullName, file.path, file.sha, file.content);
    if (cached !== undefined) {
      cachedCount++;
      if (cached) cachedResults.push(cached);
    } else {
      // Prisma / SQL → static analysis, no cache needed
      if (file.classification === 'prisma' || file.classification === 'sql' || file.path.endsWith('package.json')) {
        staticFiles.push({ path: file.path, content: file.content, language: file.language });
      } else {
        needAI.push(file);
        staticFiles.push({ path: file.path, content: file.content, language: file.language });
      }
    }
  }

  callbacks.onWarning?.(`Cache: ${cachedCount} files skipped (unchanged)`);

  // ── Stage 4: Static analysis ──────────────────────────────────────────────
  progress('static-analysis', 'Running static analysis (no AI)…', 22);

  const { partialSchema, remainingFiles, summary } = runStaticAnalysis(staticFiles);
  summary.forEach((s) => callbacks.onWarning?.(s));

  // Detect project meta from package.json
  const pkgFile = withContent.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
  const meta     = pkgFile ? parsePackageJson(pkgFile.content) : null;
  const projName = meta?.name || repoName;
  const projDesc = meta?.description || repoDescription ||
    (meta ? `${meta.framework ?? 'App'} project using ${meta.orm ?? 'unknown ORM'}` : '');

  // ── Stage 5: Create batches for AI ───────────────────────────────────────
  progress('batching', `Creating AI batches for ${remainingFiles.length} files…`, 26);

  const batches = createBatches(remainingFiles);
  callbacks.onWarning?.(`Created ${batches.length} AI batches from ${remainingFiles.length} files`);

  // ── Stage 6: AI analysis per batch ───────────────────────────────────────
  progress('ai-analysis', `Starting AI analysis (${batches.length} batches)…`, 30);

  const batchResults = await analyzeAllBatches(
    batches,
    projName,
    (_batchId, completed, total, status) => {
      const pct = 30 + Math.floor((completed / Math.max(total, 1)) * 50);
      progress(
        'ai-analysis',
        `Batch ${completed}/${total} — ${status}`,
        pct,
        completed,
        total,
      );
    },
  );

  // Cache successful batch results per file
  for (const result of batchResults) {
    if (result.status === 'success' && result.schema) {
      const batch = batches.find((b) => b.id === result.batchId);
      if (batch) {
        for (const file of batch.files) {
          const original = withContent.find((f) => f.path === file.path);
          if (original) {
            repoCache.set(repoFullName, file.path, original.sha, file.content, result.schema);
          }
        }
      }
    }
  }

  const failedCount = batchResults.filter((r) => r.status === 'failed').length;
  if (failedCount > 0) {
    const errors = batchResults
      .filter((r) => r.status === 'failed' && r.error)
      .map((r) => r.error)
      .slice(0, 3)
      .join(' | ');
    callbacks.onWarning?.(`${failedCount}/${batchResults.length} batch(es) failed — schema may be partial. Errors: ${errors}`);
  }

  // ── Stage 7: Merge all results ────────────────────────────────────────────
  progress('merging', 'Merging results from all batches…', 82);

  const allPartials: (AISchemaResponse | null)[] = [
    partialSchema,
    ...cachedResults,
    ...batchResults.map((r) => r.schema),
  ].filter(Boolean);

  const merged = mergeResults(allPartials, projName, projDesc);

  callbacks.onWarning?.(
    `Merged: ${merged.entities.length} entities, ${merged.relationships.length} relationships, ${merged.enums.length} enums`,
  );

  // ── Stage 8: Build SchemaModel ────────────────────────────────────────────
  progress('building', 'Building final schema…', 90);

  if (merged.entities.length === 0) {
    // Give a helpful error instead of silently returning an empty schema
    const allFailed = batchResults.every((r) => r.status === 'failed');
    if (allFailed && batchResults.length > 0) {
      throw new Error(
        'AI analysis failed for all file batches. ' +
        'This is likely an API rate limit or model error. Try again in a few minutes.',
      );
    }
    throw new Error(
      'No database entities were found in this repository. ' +
      'The AI could not identify any models, tables, or entities from the source code. ' +
      'Try a repo that contains Prisma schemas, SQL migrations, ORM models, or clear data models.',
    );
  }

  const store = buildFakeStore();
  applyAISchema(merged, store as never);

  progress('done', 'Schema ready!', 100);

  return store.schema;
}
