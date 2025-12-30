/**
 * Static analyzer placeholder
 * Will contain built-in static analysis rules
 */

import type { AnalysisContext, AnalysisResult, Finding } from '../../../types/index.js';
import { BaseAnalyzer } from '../types.js';

/**
 * Placeholder static analyzer
 * This will be expanded with actual static analysis rules
 */
export class StaticAnalyzer extends BaseAnalyzer {
  readonly name = 'static';
  readonly phase = 'static' as const;
  readonly description = 'Built-in static analysis rules';

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    // TODO(analyzer): Add file size warnings
    // TODO(analyzer): Add complexity analysis
    // TODO(analyzer): Add import cycle detection
    // TODO(analyzer): Add security pattern detection
    // TODO(analyzer): Add dead code detection

    // Example: Check for very large files
    for (const file of context.files) {
      if (file.size > 500 * 1024) {
        // Files over 500KB
        findings.push({
          ruleId: 'static/large-file',
          message: `File is very large (${Math.round(file.size / 1024)}KB). Consider splitting it.`,
          severity: 'warning',
          file: file.relativePath,
        });
      }
    }

    // Example: Check for common anti-patterns in file names
    for (const file of context.files) {
      const fileName = file.relativePath.split('/').pop() || '';

      // Check for test files in src (not in test directories)
      if (
        fileName.includes('.test.') &&
        !file.relativePath.includes('__tests__') &&
        !file.relativePath.includes('/test/') &&
        !file.relativePath.includes('/tests/')
      ) {
        findings.push({
          ruleId: 'static/misplaced-test',
          message: 'Test file found outside of test directory',
          severity: 'hint',
          file: file.relativePath,
        });
      }
    }

    return this.createResult(findings, startTime, {
      filesAnalyzed: context.files.length,
    });
  }
}

/**
 * Create the default static analyzer instance
 */
export function createStaticAnalyzer(): StaticAnalyzer {
  return new StaticAnalyzer();
}
