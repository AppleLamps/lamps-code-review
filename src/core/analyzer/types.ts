/**
 * Analyzer-specific types
 * Extends the base types with analyzer implementation details
 */

import type { Analyzer, AnalyzerPhase, AnalysisResult, AnalysisContext } from '../../types/index.js';

/**
 * Base class for creating analyzers
 * Provides common functionality and enforces the Analyzer interface
 */
export abstract class BaseAnalyzer implements Analyzer {
  abstract readonly name: string;
  abstract readonly phase: AnalyzerPhase;
  abstract readonly description: string;

  abstract analyze(context: AnalysisContext): Promise<AnalysisResult>;

  /**
   * Helper to create a result object with timing
   */
  protected createResult(
    findings: AnalysisResult['findings'],
    startTime: number,
    metadata?: Record<string, unknown>
  ): AnalysisResult {
    return {
      analyzerName: this.name,
      phase: this.phase,
      findings,
      duration: Date.now() - startTime,
      metadata,
    };
  }
}

/**
 * Options for the analyzer pipeline
 */
export interface PipelineOptions {
  /** Stop on first error */
  failFast?: boolean;
  /** Run analyzers in parallel within each phase */
  parallel?: boolean;
  /** Timeout per analyzer in milliseconds */
  timeout?: number;
}

/**
 * Result from running the full pipeline
 */
export interface PipelineResult {
  /** All analysis results */
  results: AnalysisResult[];
  /** Total execution time */
  duration: number;
  /** Whether any analyzer failed */
  hasErrors: boolean;
  /** Error messages if any */
  errors: string[];
}

/**
 * Event types for pipeline hooks
 */
export type PipelineEvent =
  | { type: 'phase-start'; phase: AnalyzerPhase }
  | { type: 'phase-end'; phase: AnalyzerPhase; results: AnalysisResult[] }
  | { type: 'analyzer-start'; analyzer: string }
  | { type: 'analyzer-end'; analyzer: string; result: AnalysisResult }
  | { type: 'analyzer-error'; analyzer: string; error: Error };

/**
 * Listener for pipeline events
 */
export type PipelineEventListener = (event: PipelineEvent) => void;
