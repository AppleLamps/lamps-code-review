/**
 * Code Slicing Utilities
 * Extract relevant portions of large files for AI analysis
 */

import type { CodeSlice, Finding } from '../../../types/index.js';

/** Context lines to include around a point of interest */
const CONTEXT_LINES = 10;

/** Maximum slice size in characters */
const MAX_SLICE_SIZE = 5000;

/** Patterns for security-sensitive code */
const SECURITY_PATTERNS = [
  /(?:password|secret|token|api[_-]?key|credential|auth)/i,
  /(?:process\.env\.|environ\[|getenv\()/,
  /(?:eval|exec|Function\(|subprocess|shell)/,
  /(?:innerHTML|dangerouslySetInnerHTML|v-html)/,
  /(?:sql|query|execute|raw\s*\()/i,
  /(?:cookie|session|localStorage|sessionStorage)/,
  /(?:cors|origin|access-control)/i,
  /(?:jwt|bearer|oauth)/i,
  /(?:bcrypt|argon|scrypt|pbkdf|hash)/i,
];

/** Patterns for important code constructs */
const IMPORTANT_PATTERNS = [
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|interface|type)/m,
  /^(?:async\s+)?function\s+\w+/m,
  /^class\s+\w+/m,
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:\([^)]*\)\s*=>|\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/m,
];

export interface SliceOptions {
  /** Findings from static analysis to slice around */
  staticFindings?: Finding[];
  /** Include all exports */
  includeExports?: boolean;
  /** Include security-sensitive patterns */
  includeSecurity?: boolean;
  /** Include class/function definitions */
  includeDefinitions?: boolean;
  /** Maximum total slice content size */
  maxTotalSize?: number;
}

/**
 * Extract relevant code slices from file content
 */
export function extractSlices(
  content: string,
  filePath: string,
  options: SliceOptions = {}
): CodeSlice[] {
  const lines = content.split('\n');
  const slices: CodeSlice[] = [];
  const {
    staticFindings = [],
    includeExports = true,
    includeSecurity = true,
    includeDefinitions = true,
    maxTotalSize = 20000,
  } = options;

  let totalSize = 0;

  // 1. Extract slices around static analysis findings
  for (const finding of staticFindings) {
    if (finding.file === filePath && finding.line) {
      const slice = extractContextSlice(lines, finding.line, 'Static analysis flagged this area');
      if (slice && totalSize + slice.content.length <= maxTotalSize) {
        slices.push(slice);
        totalSize += slice.content.length;
      }
    }
  }

  // 2. Extract security-sensitive sections
  if (includeSecurity) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SECURITY_PATTERNS) {
        if (pattern.test(line)) {
          const slice = extractContextSlice(lines, i + 1, 'Security-sensitive code');
          if (slice && totalSize + slice.content.length <= maxTotalSize) {
            if (!sliceOverlaps(slices, slice)) {
              slices.push(slice);
              totalSize += slice.content.length;
            }
          }
          break;
        }
      }
    }
  }

  // 3. Extract exports
  if (includeExports) {
    const exportSlices = extractExportSlices(lines);
    for (const slice of exportSlices) {
      if (totalSize + slice.content.length <= maxTotalSize) {
        if (!sliceOverlaps(slices, slice)) {
          slices.push(slice);
          totalSize += slice.content.length;
        }
      }
    }
  }

  // 4. Extract important definitions (functions, classes)
  if (includeDefinitions) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of IMPORTANT_PATTERNS) {
        if (pattern.test(line)) {
          const slice = extractDefinitionSlice(lines, i + 1);
          if (slice && totalSize + slice.content.length <= maxTotalSize) {
            if (!sliceOverlaps(slices, slice)) {
              slices.push(slice);
              totalSize += slice.content.length;
            }
          }
          break;
        }
      }
    }
  }

  // Sort by line number and merge overlapping
  return mergeOverlappingSlices(slices);
}

/**
 * Extract a context slice around a specific line
 */
function extractContextSlice(lines: string[], lineNum: number, reason: string): CodeSlice | null {
  const startLine = Math.max(1, lineNum - CONTEXT_LINES);
  const endLine = Math.min(lines.length, lineNum + CONTEXT_LINES);

  const sliceLines = lines.slice(startLine - 1, endLine);
  const content = sliceLines.join('\n');

  if (content.length > MAX_SLICE_SIZE) {
    // Truncate if too large
    const truncated = content.slice(0, MAX_SLICE_SIZE) + '\n// ... truncated';
    return { startLine, endLine, content: truncated, reason };
  }

  return { startLine, endLine, content, reason };
}

/**
 * Extract a slice containing a definition (function, class, etc.)
 * Tries to capture the full definition including its body
 */
function extractDefinitionSlice(lines: string[], startLineNum: number): CodeSlice | null {
  let braceCount = 0;
  let started = false;
  let endLine = startLineNum;

  // Look for opening brace and track nesting
  for (let i = startLineNum - 1; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      if (char === '{' || char === '(') {
        braceCount++;
        started = true;
      } else if (char === '}' || char === ')') {
        braceCount--;
      }
    }

    endLine = i + 1;

    // Stop when we've closed all braces
    if (started && braceCount === 0) {
      break;
    }

    // Safety: don't include more than 50 lines
    if (i - startLineNum + 1 > 50) {
      break;
    }
  }

  const sliceLines = lines.slice(startLineNum - 1, endLine);
  const content = sliceLines.join('\n');

  if (content.length > MAX_SLICE_SIZE) {
    return null; // Skip overly large definitions
  }

  return {
    startLine: startLineNum,
    endLine,
    content,
    reason: 'Function/class definition',
  };
}

/**
 * Extract export statement slices
 */
function extractExportSlices(lines: string[]): CodeSlice[] {
  const slices: CodeSlice[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match export statements
    if (/^export\s+/.test(line.trim())) {
      const slice = extractDefinitionSlice(lines, i + 1);
      if (slice) {
        slice.reason = 'Export';
        slices.push(slice);
      }
    }
  }

  return slices;
}

/**
 * Check if a new slice overlaps with existing slices
 */
function sliceOverlaps(existing: CodeSlice[], newSlice: CodeSlice): boolean {
  for (const slice of existing) {
    if (newSlice.startLine <= slice.endLine && newSlice.endLine >= slice.startLine) {
      return true;
    }
  }
  return false;
}

/**
 * Merge overlapping slices into contiguous blocks
 */
export function mergeOverlappingSlices(slices: CodeSlice[]): CodeSlice[] {
  if (slices.length === 0) return [];

  // Sort by start line
  const sorted = [...slices].sort((a, b) => a.startLine - b.startLine);
  const merged: CodeSlice[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if overlapping or adjacent
    if (next.startLine <= current.endLine + 1) {
      // Merge
      current.endLine = Math.max(current.endLine, next.endLine);
      current.reason = combineReasons(current.reason, next.reason);
      // Content will be reconstructed
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Combine slice reasons
 */
function combineReasons(reason1: string, reason2: string): string {
  if (reason1 === reason2) return reason1;
  const reasons = new Set([reason1, reason2]);
  return Array.from(reasons).join(', ');
}

/**
 * Reconstruct slice content from original file
 * Used after merging to get correct content
 */
export function reconstructSliceContent(content: string, slices: CodeSlice[]): CodeSlice[] {
  const lines = content.split('\n');

  return slices.map((slice) => ({
    ...slice,
    content: lines.slice(slice.startLine - 1, slice.endLine).join('\n'),
  }));
}

/**
 * Estimate token count for content (rough approximation)
 * Uses ~4 characters per token heuristic
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Get a summary of what a file exports (for architecture pass)
 */
export function getExportSummary(content: string, extension: string): string[] {
  const exports: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extension)) {
    // Named exports with types
    const namedRegex = /export\s+(const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = namedRegex.exec(content)) !== null) {
      exports.push(`${match[1]} ${match[2]}`);
    }

    // Default export
    if (/export\s+default/.test(content)) {
      exports.push('default');
    }
  }

  return exports;
}
