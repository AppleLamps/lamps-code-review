/**
 * Repository scanner module
 * Walks directory tree and returns file information
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileInfo, ScanConfig, ScanResult, ScanStats } from '../../types/index.js';
import { getExtension, getRelativePath, normalizePath } from '../../utils/index.js';
import { loadIgnoreRules, type IgnoreRules } from './ignore-rules.js';

/** Default scan configuration */
const DEFAULT_SCAN_CONFIG: Required<ScanConfig> = {
  ignorePatterns: [],
  useGitignore: true,
  maxFileSize: 1024 * 1024, // 1MB
  includeExtensions: [],
};

/** Extensions commonly associated with code files */
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.toml',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.vue',
  '.svelte',
]);

/**
 * Scan a repository and return file information
 */
export async function scanRepository(
  rootPath: string,
  config: ScanConfig = {}
): Promise<ScanResult> {
  const resolvedRoot = normalizePath(rootPath);
  const mergedConfig = { ...DEFAULT_SCAN_CONFIG, ...config };

  // Load ignore rules
  const ignoreRules = await loadIgnoreRules(
    resolvedRoot,
    mergedConfig.ignorePatterns
  );

  // Collect files
  const files: FileInfo[] = [];
  const stats: ScanStats = {
    totalFiles: 0,
    totalSize: 0,
    skippedFiles: 0,
    byExtension: {},
  };

  await walkDirectory(resolvedRoot, resolvedRoot, mergedConfig, ignoreRules, files, stats);

  return {
    files,
    stats,
    rootPath: resolvedRoot,
  };
}

/**
 * Recursively walk a directory and collect file information
 */
async function walkDirectory(
  currentPath: string,
  rootPath: string,
  config: Required<ScanConfig>,
  ignoreRules: IgnoreRules,
  files: FileInfo[],
  stats: ScanStats
): Promise<void> {
  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
  } catch {
    // Directory can't be read, skip it
    return;
  }

  // TODO(feature): Add parallel scanning for better performance on large repos

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = getRelativePath(rootPath, fullPath);

    // Check if should be ignored
    if (ignoreRules.isIgnored(relativePath)) {
      stats.skippedFiles++;
      continue;
    }

    if (entry.isDirectory()) {
      // Recurse into subdirectory
      await walkDirectory(fullPath, rootPath, config, ignoreRules, files, stats);
    } else if (entry.isFile()) {
      // Process file
      const fileInfo = await processFile(fullPath, rootPath, config);

      if (fileInfo) {
        files.push(fileInfo);
        stats.totalFiles++;
        stats.totalSize += fileInfo.size;

        // Track by extension
        const ext = fileInfo.extension || '(none)';
        stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
      } else {
        stats.skippedFiles++;
      }
    }
  }
}

/**
 * Process a single file and return FileInfo if it should be included
 */
async function processFile(
  filePath: string,
  rootPath: string,
  config: Required<ScanConfig>
): Promise<FileInfo | null> {
  const extension = getExtension(filePath);

  // Check extension filter
  if (config.includeExtensions.length > 0) {
    if (!config.includeExtensions.includes(extension)) {
      return null;
    }
  } else {
    // Default: only include known code extensions
    if (!CODE_EXTENSIONS.has(extension)) {
      return null;
    }
  }

  // Get file stats
  let fileStats: fs.Stats;
  try {
    fileStats = await fs.promises.stat(filePath);
  } catch {
    return null;
  }

  // Check file size
  if (fileStats.size > config.maxFileSize) {
    return null;
  }

  // TODO(feature): Add binary file detection to skip non-text files

  return {
    path: normalizePath(filePath),
    relativePath: getRelativePath(rootPath, filePath),
    extension,
    size: fileStats.size,
    // Content is loaded on-demand, not during scanning
    content: undefined,
  };
}

/**
 * Load content for a file (on-demand loading)
 */
export async function loadFileContent(file: FileInfo): Promise<string> {
  if (file.content !== undefined) {
    return file.content;
  }

  const content = await fs.promises.readFile(file.path, 'utf-8');
  file.content = content;
  return content;
}

// Re-export types and utilities
export { loadIgnoreRules, type IgnoreRules };
