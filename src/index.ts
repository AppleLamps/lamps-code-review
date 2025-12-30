/**
 * LampsCodeReview SDK
 * AI-powered code review for modern web codebases
 *
 * @example
 * ```typescript
 * import { LampsCodeReview } from 'lamps-code-review';
 *
 * const reviewer = new LampsCodeReview();
 * const report = await reviewer.review('./my-project');
 * console.log(report.summary.healthScore);
 * ```
 */

import { scanRepository } from './core/scanner/index.js';
import { detectFrameworks } from './core/detector/index.js';
import { AnalyzerPipeline } from './core/analyzer/index.js';
import { generateReport, formatReport } from './core/reporter/index.js';
import { loadConfig, mergeAIConfig } from './core/config/index.js';
import type {
  ReviewConfig,
  ReviewReport,
  Analyzer,
  AnalysisContext,
  AIConfig,
} from './types/index.js';
import { createLogger, createProgressLogger } from './utils/index.js';

/**
 * Main SDK class for running code reviews
 */
export class LampsCodeReview {
  private config: ReviewConfig;
  private customAnalyzers: Analyzer[] = [];

  constructor(config: ReviewConfig = {}) {
    this.config = config;
  }

  /**
   * Run a code review on a repository
   * @param repoPath - Path to the repository to review
   * @returns Structured review report
   */
  async review(repoPath: string): Promise<ReviewReport> {
    const logger = createLogger(this.config.verbose);
    logger.debug(`Starting review of: ${repoPath}`);

    // Create progress logger for analyzers (passed via context, not global)
    const progressLogger = createProgressLogger(this.config.verbose || false);

    // Load config file from repo (if exists)
    const fileConfig = await loadConfig(repoPath);

    // Merge configs: file config < constructor config (constructor takes priority)
    const mergedConfig: ReviewConfig = {
      ...fileConfig,
      ...this.config,
      ai: { ...fileConfig.ai, ...this.config.ai },
      scan: { ...fileConfig.scan, ...this.config.scan },
    };

    // Build AI config
    const aiConfig: AIConfig = mergeAIConfig(mergedConfig.ai);
    logger.debug(`AI model: ${aiConfig.model}`);

    // Create pipeline with AI config
    const pipeline = new AnalyzerPipeline({}, aiConfig);

    // Register custom analyzers
    for (const analyzer of this.customAnalyzers) {
      pipeline.registerAnalyzer(analyzer);
    }

    // Phase 1: Scan repository
    logger.debug('Scanning repository...');
    const scanResult = await scanRepository(repoPath, mergedConfig.scan);
    logger.debug(`Found ${scanResult.files.length} files`);

    // Phase 2: Detect frameworks
    logger.debug('Detecting frameworks...');
    const frameworks = await detectFrameworks(scanResult.files, scanResult.rootPath);
    logger.debug(`Primary framework: ${frameworks.primary || 'unknown'}`);

    // Phase 3: Run analyzers
    logger.debug('Running analyzers...');
    const context: AnalysisContext = {
      files: scanResult.files,
      frameworks,
      config: mergedConfig,
      rootPath: scanResult.rootPath,
      logger: progressLogger,
    };

    const pipelineResult = await pipeline.run(context);
    logger.debug(`Analysis complete in ${pipelineResult.duration}ms`);

    if (pipelineResult.hasErrors) {
      for (const error of pipelineResult.errors) {
        logger.warn(`Analyzer error: ${error}`);
      }
    }

    // Phase 4: Generate report
    logger.debug('Generating report...');
    const report = generateReport(
      scanResult.rootPath,
      scanResult.files.length,
      frameworks,
      pipelineResult.results
    );

    return report;
  }

  /**
   * Register a custom analyzer
   * @param analyzer - Analyzer instance to register
   */
  registerAnalyzer(analyzer: Analyzer): void {
    this.customAnalyzers.push(analyzer);
  }

  /**
   * Get registered custom analyzers
   */
  getCustomAnalyzers(): Analyzer[] {
    return [...this.customAnalyzers];
  }

  /**
   * Format a report to a specific output format
   * @param report - Report to format
   * @param format - Output format ('json', 'markdown', 'html')
   */
  formatReport(
    report: ReviewReport,
    format: ReviewConfig['format'] = 'json'
  ): string {
    return formatReport(report, format || 'json');
  }
}

// Re-export types for SDK consumers
export type {
  ReviewConfig,
  ReviewReport,
  ReportSummary,
  Finding,
  Severity,
  Analyzer,
  AnalyzerPhase,
  AnalysisContext,
  AnalysisResult,
  Framework,
  DetectionResult,
  FrameworkDetection,
  FileInfo,
  ScanConfig,
  ScanResult,
  ReportFormat,
  CLIOptions,
  AIConfig,
  LampsConfig,
} from './types/index.js';

// Re-export default config
export { DEFAULT_AI_CONFIG } from './types/index.js';

// Re-export core modules for advanced usage
export { scanRepository, loadFileContent } from './core/scanner/index.js';
export { detectFrameworks } from './core/detector/index.js';
export { AnalyzerPipeline, BaseAnalyzer } from './core/analyzer/index.js';
export { generateReport, formatReport } from './core/reporter/index.js';
export { loadConfig, mergeAIConfig } from './core/config/index.js';
