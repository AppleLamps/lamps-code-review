/**
 * Utility functions for LampsCodeReview SDK
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Get file extension from a path (normalized to lowercase with leading dot)
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext || '';
}

/**
 * Check if a path exists and is a directory
 */
export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a file
 */
export async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Read file content as string
 */
export async function readFileContent(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8');
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.promises.stat(filePath);
  return stats.size;
}

/**
 * Normalize a path to use forward slashes and resolve to absolute
 */
export function normalizePath(inputPath: string): string {
  return path.resolve(inputPath).replace(/\\/g, '/');
}

/**
 * Get relative path from root, normalized with forward slashes
 */
export function getRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

/**
 * Simple pattern matching for glob-like patterns
 * Supports: * (any chars), ** (any path segments)
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize both paths
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  const regexPattern = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedPath);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Create a simple logger with optional verbose mode
 */
export function createLogger(verbose: boolean = false) {
  return {
    info: (message: string) => console.log(message),
    error: (message: string) => console.error(message),
    debug: (message: string) => {
      if (verbose) console.log(`[DEBUG] ${message}`);
    },
    warn: (message: string) => console.warn(`[WARN] ${message}`),
  };
}

// Re-export progress logger
export {
  createLogger as createProgressLogger,
  setGlobalLogger,
  getGlobalLogger,
  type ProgressLogger,
} from './logger.js';
