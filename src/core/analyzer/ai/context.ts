/**
 * Context Builder
 * Builds smart, focused context for each AI pass
 */

import * as fs from 'node:fs';
import type {
  AnalysisContext,
  AnalysisResult,
  DependencyGraph,
  FileNode,
  FileInfo,
  Finding,
  ReviewContext,
  ContextFile,
  AIPassType,
} from '../../../types/index.js';
import { deserializeGraph } from '../dependency/index.js';
import { extractSlices, estimateTokens, reconstructSliceContent } from './slices.js';

/** Token budget for each pass */
const TOKEN_BUDGETS: Record<AIPassType, number> = {
  architecture: 15000,
  'deep-dive': 40000,
  security: 25000,
};

/** File size threshold for slicing (50KB) */
const SLICE_THRESHOLD = 50 * 1024;

/**
 * Build context for the architecture pass
 * Focus: File tree, entry points, config files, high-level structure
 */
export async function buildArchitectureContext(
  context: AnalysisContext,
  graph: DependencyGraph
): Promise<ReviewContext> {
  const files: ContextFile[] = [];
  const budget = TOKEN_BUDGETS.architecture;
  let usedTokens = 0;

  // 1. Add file tree (paths only) - always include
  const fileTree = buildFileTree(context.files);
  const treeTokens = estimateTokens(fileTree);
  usedTokens += treeTokens;

  // 2. Add package.json / pyproject.toml (critical for understanding project)
  const packageFiles = ['package.json', 'pyproject.toml', 'requirements.txt'];
  for (const pkgFile of packageFiles) {
    const file = context.files.find((f) => f.relativePath === pkgFile);
    if (file) {
      const content = await loadContent(file);
      if (content) {
        const tokens = estimateTokens(content);
        if (usedTokens + tokens < budget) {
          files.push({
            path: file.relativePath,
            content,
            reason: 'Package configuration',
            priority: 100,
          });
          usedTokens += tokens;
        }
      }
    }
  }

  // 3. Add entry point files (full content if small, slices if large)
  const entryFiles = graph.entryPoints
    .map((p) => context.files.find((f) => f.relativePath === p))
    .filter((f): f is FileInfo => f !== undefined)
    .slice(0, 5); // Limit to 5 entry points

  for (const file of entryFiles) {
    const contextFile = await buildContextFile(file, 'Entry point', budget - usedTokens);
    if (contextFile) {
      files.push(contextFile);
      usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
    }
  }

  // 4. Add config files
  const configFiles = graph.configFiles
    .map((p) => context.files.find((f) => f.relativePath === p))
    .filter((f): f is FileInfo => f !== undefined)
    .slice(0, 5);

  for (const file of configFiles) {
    const contextFile = await buildContextFile(file, 'Configuration', budget - usedTokens);
    if (contextFile) {
      files.push(contextFile);
      usedTokens += estimateTokens(contextFile.content || '');
    }
  }

  // 5. Add README if exists
  const readme = context.files.find((f) => /readme\.md$/i.test(f.relativePath));
  if (readme) {
    const content = await loadContent(readme);
    if (content) {
      const tokens = estimateTokens(content);
      if (usedTokens + tokens < budget) {
        files.push({
          path: readme.relativePath,
          content,
          reason: 'Project documentation',
          priority: 50,
        });
      }
    }
  }

  // Build full file tree for architecture context
  const fullFileTree = context.files.map((f) => f.relativePath).sort();

  return {
    pass: 'architecture',
    files,
    metadata: {
      totalFiles: context.files.length,
      totalTokenEstimate: usedTokens,
      frameworks: context.frameworks.frameworks.map((f) => f.framework),
      focusAreas: ['Project structure', 'Dependencies', 'Entry points', 'Configuration'],
      fullFileTree,
    },
  };
}

/**
 * Build context for the deep-dive pass
 * Focus: High-priority files, static analysis hotspots, high-connectivity modules
 */
export async function buildDeepDiveContext(
  context: AnalysisContext,
  graph: DependencyGraph,
  staticFindings: Finding[],
  architectureFindings: Finding[]
): Promise<ReviewContext> {
  const files: ContextFile[] = [];
  const budget = TOKEN_BUDGETS['deep-dive'];
  let usedTokens = 0;

  // Get files sorted by priority
  const sortedNodes = Array.from(graph.files.values())
    .filter((n) => n.category !== 'test' && n.category !== 'config')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // 1. Files with static analysis findings (highest priority)
  const filesWithFindings = new Set(staticFindings.map((f) => f.file));
  const flaggedFiles = context.files.filter((f) => filesWithFindings.has(f.relativePath));

  for (const file of flaggedFiles) {
    const fileFindings = staticFindings.filter((f) => f.file === file.relativePath);
    const contextFile = await buildContextFile(
      file,
      `Static analysis flagged (${fileFindings.length} issues)`,
      budget - usedTokens,
      fileFindings
    );
    if (contextFile) {
      files.push(contextFile);
      usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
    }
  }

  // 2. Files mentioned in architecture findings
  const mentionedFiles = extractMentionedFiles(architectureFindings, context.files);
  for (const file of mentionedFiles) {
    if (!files.find((f) => f.path === file.relativePath)) {
      const contextFile = await buildContextFile(
        file,
        'Flagged in architecture review',
        budget - usedTokens
      );
      if (contextFile) {
        files.push(contextFile);
        usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
      }
    }
  }

  // 3. High-connectivity files (many importedBy)
  const highConnectivity = sortedNodes
    .filter((n) => n.importedBy.length >= 3)
    .slice(0, 10);

  for (const node of highConnectivity) {
    const file = context.files.find((f) => f.relativePath === node.path);
    if (file && !files.find((f) => f.path === file.relativePath)) {
      const contextFile = await buildContextFile(
        file,
        `High connectivity (${node.importedBy.length} dependents)`,
        budget - usedTokens
      );
      if (contextFile) {
        files.push(contextFile);
        usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
      }
    }
  }

  // 4. Fill remaining budget with high-priority files
  for (const node of sortedNodes) {
    if (usedTokens >= budget * 0.9) break; // Leave 10% buffer

    const file = context.files.find((f) => f.relativePath === node.path);
    if (file && !files.find((f) => f.path === file.relativePath)) {
      const contextFile = await buildContextFile(
        file,
        `Priority score: ${node.priority}`,
        budget - usedTokens
      );
      if (contextFile) {
        files.push(contextFile);
        usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
      }
    }
  }

  return {
    pass: 'deep-dive',
    files,
    metadata: {
      totalFiles: files.length,
      totalTokenEstimate: usedTokens,
      frameworks: context.frameworks.frameworks.map((f) => f.framework),
      focusAreas: ['Code quality', 'Bugs', 'Performance', 'Best practices'],
    },
  };
}

/**
 * Build context for the security pass
 * Focus: Auth, API routes, data handling, sensitive operations
 */
export async function buildSecurityContext(
  context: AnalysisContext,
  graph: DependencyGraph
): Promise<ReviewContext> {
  const files: ContextFile[] = [];
  const budget = TOKEN_BUDGETS.security;
  let usedTokens = 0;

  // Security-sensitive file patterns
  const securityPatterns = [
    /auth/i,
    /login/i,
    /session/i,
    /token/i,
    /password/i,
    /secret/i,
    /credential/i,
    /middleware/i,
    /permission/i,
    /role/i,
    /crypto/i,
    /encrypt/i,
    /hash/i,
    /sanitize/i,
    /validate/i,
  ];

  // 1. API route files
  const apiFiles = graph.apiFiles
    .map((p) => context.files.find((f) => f.relativePath === p))
    .filter((f): f is FileInfo => f !== undefined);

  for (const file of apiFiles) {
    const contextFile = await buildContextFile(file, 'API route', budget - usedTokens);
    if (contextFile) {
      files.push(contextFile);
      usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
    }
  }

  // 2. Security-sensitive files by name
  const securityFiles = context.files.filter((f) =>
    securityPatterns.some((p) => p.test(f.relativePath))
  );

  for (const file of securityFiles) {
    if (!files.find((f) => f.path === file.relativePath)) {
      const contextFile = await buildContextFile(file, 'Security-sensitive file', budget - usedTokens);
      if (contextFile) {
        files.push(contextFile);
        usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
      }
    }
  }

  // 3. Environment/config files (for secrets exposure check)
  const envFiles = context.files.filter((f) =>
    /\.env\.example|\.env\.sample|config.*\.(ts|js|json)$/i.test(f.relativePath)
  );

  for (const file of envFiles) {
    if (!files.find((f) => f.path === file.relativePath)) {
      const contextFile = await buildContextFile(file, 'Environment/Config', budget - usedTokens);
      if (contextFile) {
        files.push(contextFile);
        usedTokens += estimateTokens(contextFile.content || '');
      }
    }
  }

  // 4. Database/model files
  const dbPatterns = [/model/i, /schema/i, /database/i, /db\./i, /migration/i, /query/i];
  const dbFiles = context.files.filter((f) =>
    dbPatterns.some((p) => p.test(f.relativePath))
  );

  for (const file of dbFiles) {
    if (!files.find((f) => f.path === file.relativePath) && usedTokens < budget * 0.9) {
      const contextFile = await buildContextFile(file, 'Database/Model', budget - usedTokens);
      if (contextFile) {
        files.push(contextFile);
        usedTokens += estimateTokens(contextFile.content || contextFile.slices?.map((s) => s.content).join('\n') || '');
      }
    }
  }

  return {
    pass: 'security',
    files,
    metadata: {
      totalFiles: files.length,
      totalTokenEstimate: usedTokens,
      frameworks: context.frameworks.frameworks.map((f) => f.framework),
      focusAreas: ['Authentication', 'Authorization', 'Input validation', 'Data exposure', 'Injection vulnerabilities'],
    },
  };
}

/**
 * Build a context file entry
 * Uses full content for small files, slices for large files
 */
async function buildContextFile(
  file: FileInfo,
  reason: string,
  remainingBudget: number,
  findings?: Finding[]
): Promise<ContextFile | null> {
  const content = await loadContent(file);
  if (!content) return null;

  const tokens = estimateTokens(content);

  // If file is small and fits in budget, include full content
  if (file.size < SLICE_THRESHOLD && tokens < remainingBudget) {
    return {
      path: file.relativePath,
      content,
      reason,
      priority: 50,
    };
  }

  // For large files, extract slices
  const slices = extractSlices(content, file.relativePath, {
    staticFindings: findings,
    includeExports: true,
    includeSecurity: true,
    includeDefinitions: true,
    maxTotalSize: Math.min(remainingBudget * 4, 20000), // Rough char limit
  });

  const reconstructed = reconstructSliceContent(content, slices);
  const sliceContent = reconstructed.map((s) => s.content).join('\n');
  const sliceTokens = estimateTokens(sliceContent);

  if (sliceTokens > remainingBudget) return null;

  // If slices are almost as big as the file, just use full content
  if (sliceTokens > tokens * 0.8 && tokens < remainingBudget) {
    return {
      path: file.relativePath,
      content,
      reason,
      priority: 50,
    };
  }

  return {
    path: file.relativePath,
    slices: reconstructed,
    reason: `${reason} (sliced)`,
    priority: 50,
  };
}

/**
 * Load file content
 */
async function loadContent(file: FileInfo): Promise<string | null> {
  if (file.content) return file.content;

  try {
    return await fs.promises.readFile(file.path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build a file tree string representation
 */
function buildFileTree(files: FileInfo[]): string {
  const paths = files.map((f) => f.relativePath).sort();
  return paths.join('\n');
}

/**
 * Extract files mentioned in findings
 */
function extractMentionedFiles(findings: Finding[], allFiles: FileInfo[]): FileInfo[] {
  const mentioned: FileInfo[] = [];

  for (const finding of findings) {
    if (finding.file) {
      const file = allFiles.find((f) => f.relativePath === finding.file);
      if (file && !mentioned.includes(file)) {
        mentioned.push(file);
      }
    }
  }

  return mentioned;
}

/**
 * Get dependency graph from analysis results
 */
export function getDependencyGraphFromResults(results: AnalysisResult[]): DependencyGraph | null {
  const depResult = results.find((r) => r.analyzerName === 'dependency');
  if (!depResult?.metadata?.dependencyGraph) return null;

  try {
    return deserializeGraph(depResult.metadata.dependencyGraph as {
      files: Record<string, FileNode>;
      entryPoints: string[];
      configFiles: string[];
      testFiles: string[];
      apiFiles: string[];
    });
  } catch {
    return null;
  }
}

/**
 * Create an empty dependency graph for fallback
 */
export function createEmptyGraph(files: FileInfo[]): DependencyGraph {
  const graph: DependencyGraph = {
    files: new Map(),
    entryPoints: [],
    configFiles: [],
    testFiles: [],
    apiFiles: [],
  };

  for (const file of files) {
    graph.files.set(file.relativePath, {
      path: file.relativePath,
      imports: [],
      importedBy: [],
      exports: [],
      category: 'other',
      size: file.size,
      priority: 50,
    });
  }

  return graph;
}
