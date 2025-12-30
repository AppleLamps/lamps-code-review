/**
 * Dependency Analyzer module
 * Builds an import/export graph and categorizes files for smart context selection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AnalysisContext,
  AnalysisResult,
  FileInfo,
  DependencyGraph,
  FileNode,
  FileCategory,
  Finding,
} from '../../../types/index.js';
import { BaseAnalyzer } from '../types.js';
import { getGlobalLogger } from '../../../utils/logger.js';

/** Patterns that indicate entry point files */
const ENTRY_POINT_PATTERNS = [
  /^index\.[jt]sx?$/,
  /^main\.[jt]sx?$/,
  /^app\.[jt]sx?$/,
  /^server\.[jt]sx?$/,
  /pages\/.*\.[jt]sx?$/,
  /app\/.*\/page\.[jt]sx?$/,
  /routes\/.*\.[jt]sx?$/,
  /^src\/index\.[jt]sx?$/,
  /^src\/main\.[jt]sx?$/,
  /^src\/app\.[jt]sx?$/,
];

/** Patterns that indicate config files */
const CONFIG_PATTERNS = [
  /\.config\.[jt]s$/,
  /\.config\.m?js$/,
  /^tsconfig.*\.json$/,
  /^package\.json$/,
  /^\.env\.example$/,
  /^next\.config\./,
  /^vite\.config\./,
  /^webpack\.config\./,
  /^tailwind\.config\./,
  /^postcss\.config\./,
  /^jest\.config\./,
  /^vitest\.config\./,
  /^eslint\.config\./,
  /^\.eslintrc/,
  /^\.prettierrc/,
];

/** Patterns that indicate test files */
const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /\.test\.py$/,
  /test_.*\.py$/,
];

/** Patterns that indicate API route files */
const API_PATTERNS = [
  /pages\/api\//,
  /app\/api\//,
  /routes\//,
  /controllers?\//,
  /endpoints?\//,
  /\/api\//,
];

/** Patterns that indicate security-sensitive files */
const SECURITY_PATTERNS = [
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
];

/**
 * Dependency Analyzer - builds import graph and categorizes files
 * Runs in the static phase before AI analysis
 */
export class DependencyAnalyzer extends BaseAnalyzer {
  readonly name = 'dependency';
  readonly phase = 'static' as const;
  readonly description = 'Analyzes import/export relationships and categorizes files';

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];
    const logger = getGlobalLogger();

    logger.phase('Dependency Analysis');
    logger.step(`Analyzing ${context.files.length} files...`);

    // Build the dependency graph
    const graph = await this.buildGraph(context.files, context.rootPath);

    // Calculate priority scores for each file
    this.calculatePriorities(graph);

    // Log stats
    logger.detail(`Entry points: ${graph.entryPoints.length}`);
    logger.detail(`Config files: ${graph.configFiles.length}`);
    logger.detail(`API routes: ${graph.apiFiles.length}`);
    logger.detail(`Test files: ${graph.testFiles.length}`);

    // Find high-priority files
    const highPriority = Array.from(graph.files.values())
      .filter((n) => (n.priority || 0) > 50)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 5);

    if (highPriority.length > 0) {
      logger.step('Top priority files:');
      for (const node of highPriority) {
        logger.detail(`${node.path} (score: ${node.priority})`);
      }
    }

    logger.success(`Dependency graph built in ${Date.now() - startTime}ms`);

    // Store the graph in metadata for use by AI analyzer
    return this.createResult(findings, startTime, {
      dependencyGraph: this.serializeGraph(graph),
      stats: {
        totalFiles: graph.files.size,
        entryPoints: graph.entryPoints.length,
        configFiles: graph.configFiles.length,
        testFiles: graph.testFiles.length,
        apiFiles: graph.apiFiles.length,
      },
    });
  }

  /**
   * Build the dependency graph from scanned files
   */
  private async buildGraph(files: FileInfo[], _rootPath: string): Promise<DependencyGraph> {
    const graph: DependencyGraph = {
      files: new Map(),
      entryPoints: [],
      configFiles: [],
      testFiles: [],
      apiFiles: [],
    };

    // First pass: create nodes and extract imports/exports
    for (const file of files) {
      const category = this.categorizeFile(file.relativePath);
      const content = await this.loadContent(file);

      const node: FileNode = {
        path: file.relativePath,
        imports: content ? this.extractImports(content, file.extension, file.relativePath) : [],
        importedBy: [],
        exports: content ? this.extractExports(content, file.extension) : [],
        category,
        size: file.size,
      };

      graph.files.set(file.relativePath, node);

      // Categorize into lists
      if (category === 'entry') graph.entryPoints.push(file.relativePath);
      if (category === 'config') graph.configFiles.push(file.relativePath);
      if (category === 'test') graph.testFiles.push(file.relativePath);
      if (category === 'api') graph.apiFiles.push(file.relativePath);
    }

    // Second pass: build reverse dependencies (importedBy)
    for (const [filePath, node] of graph.files) {
      for (const importPath of node.imports) {
        const resolvedPath = this.resolveImportPath(importPath, filePath, graph);
        if (resolvedPath && graph.files.has(resolvedPath)) {
          const importedNode = graph.files.get(resolvedPath)!;
          if (!importedNode.importedBy.includes(filePath)) {
            importedNode.importedBy.push(filePath);
          }
        }
      }
    }

    return graph;
  }

  /**
   * Categorize a file based on its path
   */
  private categorizeFile(relativePath: string): FileCategory {
    // Check for test files first
    if (TEST_PATTERNS.some((p) => p.test(relativePath))) {
      return 'test';
    }

    // Check for config files
    if (CONFIG_PATTERNS.some((p) => p.test(relativePath))) {
      return 'config';
    }

    // Check for API routes
    if (API_PATTERNS.some((p) => p.test(relativePath))) {
      return 'api';
    }

    // Check for entry points
    if (ENTRY_POINT_PATTERNS.some((p) => p.test(relativePath))) {
      return 'entry';
    }

    // Check for common component patterns
    if (/components?\//.test(relativePath)) {
      return 'component';
    }

    // Check for utility patterns
    if (/utils?\/|helpers?\/|lib\/|services?\//.test(relativePath)) {
      return 'util';
    }

    return 'other';
  }

  /**
   * Load file content for analysis
   */
  private async loadContent(file: FileInfo): Promise<string | null> {
    if (file.content) return file.content;

    try {
      return await fs.promises.readFile(file.path, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Extract import statements from file content
   */
  private extractImports(content: string, extension: string, _filePath: string): string[] {
    const imports: string[] = [];

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extension)) {
      // ES6 imports
      const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // Dynamic imports
      const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = dynamicRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // require() calls
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    } else if (extension === '.py') {
      // Python imports
      const importRegex = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1] || match[2]);
      }
    }

    return imports;
  }

  /**
   * Extract export statements from file content
   */
  private extractExports(content: string, extension: string): string[] {
    const exports: string[] = [];

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extension)) {
      // Named exports
      const namedRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
      let match;
      while ((match = namedRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // Export default
      if (/export\s+default/.test(content)) {
        exports.push('default');
      }

      // Re-exports
      const reExportRegex = /export\s+\{([^}]+)\}/g;
      while ((match = reExportRegex.exec(content)) !== null) {
        const names = match[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
        exports.push(...names);
      }
    } else if (extension === '.py') {
      // Python: look for __all__ or top-level definitions
      const defRegex = /^(?:def|class|async\s+def)\s+(\w+)/gm;
      let match;
      while ((match = defRegex.exec(content)) !== null) {
        if (!match[1].startsWith('_')) {
          exports.push(match[1]);
        }
      }
    }

    return exports;
  }

  /**
   * Resolve an import path to a file in the graph
   */
  private resolveImportPath(
    importPath: string,
    fromFile: string,
    graph: DependencyGraph
  ): string | null {
    // Skip external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    const fromDir = path.dirname(fromFile);
    let resolved = path.normalize(path.join(fromDir, importPath)).replace(/\\/g, '/');

    // Try various extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

    // Check exact match first
    if (graph.files.has(resolved)) {
      return resolved;
    }

    // Try with extensions
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (graph.files.has(withExt)) {
        return withExt;
      }
    }

    // Remove leading ./ or src/ for common patterns
    if (resolved.startsWith('./')) {
      resolved = resolved.slice(2);
    }

    if (graph.files.has(resolved)) {
      return resolved;
    }

    return null;
  }

  /**
   * Calculate priority scores for each file
   */
  private calculatePriorities(graph: DependencyGraph): void {
    for (const [filePath, node] of graph.files) {
      let score = 0;

      // Entry points are critical
      if (node.category === 'entry') score += 100;
      if (node.category === 'config') score += 80;
      if (node.category === 'api') score += 70;

      // High connectivity = important
      score += node.importedBy.length * 10; // Many dependents
      score += Math.min(node.imports.length * 2, 20); // Imports (capped)

      // Many exports = important module
      score += Math.min(node.exports.length * 3, 30);

      // Security-sensitive patterns in filename
      if (SECURITY_PATTERNS.some((p) => p.test(filePath))) {
        score += 50;
      }

      // Size penalty for very large files (prefer slices)
      if (node.size > 50000) score -= 20;
      if (node.size > 100000) score -= 30;

      // Test files have lower priority for main review
      if (node.category === 'test') score -= 40;

      node.priority = Math.max(0, score);
    }
  }

  /**
   * Serialize graph for storage in metadata
   * (Maps don't serialize to JSON well)
   */
  private serializeGraph(graph: DependencyGraph): object {
    const files: Record<string, FileNode> = {};
    for (const [path, node] of graph.files) {
      files[path] = node;
    }

    return {
      files,
      entryPoints: graph.entryPoints,
      configFiles: graph.configFiles,
      testFiles: graph.testFiles,
      apiFiles: graph.apiFiles,
    };
  }
}

/**
 * Deserialize graph from metadata
 */
export function deserializeGraph(data: {
  files: Record<string, FileNode>;
  entryPoints: string[];
  configFiles: string[];
  testFiles: string[];
  apiFiles: string[];
}): DependencyGraph {
  const files = new Map<string, FileNode>();
  for (const [path, node] of Object.entries(data.files)) {
    files.set(path, node);
  }

  return {
    files,
    entryPoints: data.entryPoints,
    configFiles: data.configFiles,
    testFiles: data.testFiles,
    apiFiles: data.apiFiles,
  };
}

/**
 * Create a dependency analyzer instance
 */
export function createDependencyAnalyzer(): DependencyAnalyzer {
  return new DependencyAnalyzer();
}
