/**
 * Ignore rules handling for repository scanning
 * Parses .gitignore files and custom ignore patterns
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IgnoreRules {
  patterns: string[];
  isIgnored: (filePath: string) => boolean;
}

/** Default patterns to always ignore */
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  'coverage',
  '.nyc_output',
];

/**
 * Load ignore rules from .gitignore and combine with custom patterns
 */
export async function loadIgnoreRules(
  rootPath: string,
  customPatterns: string[] = []
): Promise<IgnoreRules> {
  const patterns: string[] = [...DEFAULT_IGNORE_PATTERNS];

  // Try to load .gitignore
  const gitignorePath = path.join(rootPath, '.gitignore');
  try {
    const content = await fs.promises.readFile(gitignorePath, 'utf-8');
    const gitignorePatterns = parseGitignore(content);
    patterns.push(...gitignorePatterns);
  } catch {
    // .gitignore doesn't exist or can't be read, continue without it
  }

  // Add custom patterns
  patterns.push(...customPatterns);

  return {
    patterns,
    isIgnored: (filePath: string) => shouldIgnore(filePath, patterns),
  };
}

/**
 * Parse .gitignore content into patterns
 */
function parseGitignore(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * Check if a file path should be ignored based on patterns
 */
function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const pathParts = normalizedPath.split('/');

  for (const pattern of patterns) {
    // Check if any path segment matches the pattern
    if (matchesPattern(normalizedPath, pattern, pathParts)) {
      return true;
    }
  }

  return false;
}

/**
 * Match a file path against a single pattern
 */
function matchesPattern(
  filePath: string,
  pattern: string,
  pathParts: string[]
): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Handle negation patterns (we don't support them yet)
  if (normalizedPattern.startsWith('!')) {
    // TODO(feature): Support negation patterns
    return false;
  }

  // Handle directory-specific patterns (ending with /)
  const isDirectoryPattern = normalizedPattern.endsWith('/');
  const cleanPattern = isDirectoryPattern
    ? normalizedPattern.slice(0, -1)
    : normalizedPattern;

  // Simple exact match on path segments
  for (const part of pathParts) {
    if (simpleMatch(part, cleanPattern)) {
      return true;
    }
  }

  // Full path match
  if (simpleMatch(filePath, cleanPattern)) {
    return true;
  }

  // Check if pattern matches end of path
  if (filePath.endsWith('/' + cleanPattern) || filePath.endsWith(cleanPattern)) {
    return true;
  }

  return false;
}

/**
 * Simple glob matching supporting * and **
 */
function simpleMatch(text: string, pattern: string): boolean {
  // Exact match
  if (text === pattern) return true;

  // Handle ** (match any path)
  if (pattern.includes('**')) {
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/(?<!\.)(\*)(?!\*)/g, '[^/]*') +
        '$'
    );
    return regex.test(text);
  }

  // Handle single * (match anything except /)
  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*') + '$'
    );
    return regex.test(text);
  }

  return false;
}
