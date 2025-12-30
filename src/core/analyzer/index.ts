/**
 * Analyzer pipeline module
 * Orchestrates running multiple analyzers in phases
 */

import type { Analyzer, AnalysisContext, AnalysisResult, AnalyzerPhase, AIConfig } from '../../types/index.js';
import type {
  PipelineOptions,
  PipelineResult,
  PipelineEventListener,
  PipelineEvent,
} from './types.js';
import { createStaticAnalyzer } from './static/index.js';
import { createAIAnalyzer } from './ai/index.js';
import { createDependencyAnalyzer } from './dependency/index.js';

/** Execution order for phases */
const PHASE_ORDER: AnalyzerPhase[] = ['static', 'ai', 'post'];

/**
 * Analyzer pipeline - orchestrates running analyzers in phases
 */
export class AnalyzerPipeline {
  private analyzers: Map<string, Analyzer> = new Map();
  private listeners: PipelineEventListener[] = [];
  private options: Required<PipelineOptions>;

  constructor(options: PipelineOptions = {}, aiConfig?: AIConfig) {
    this.options = {
      failFast: false,
      parallel: false,
      timeout: 120000, // 2 minutes per analyzer (AI may take longer)
      ...options,
    };

    // Register built-in analyzers
    this.registerAnalyzer(createStaticAnalyzer());
    this.registerAnalyzer(createDependencyAnalyzer());

    // Register AI analyzer if config provided
    if (aiConfig) {
      this.registerAnalyzer(createAIAnalyzer(aiConfig));
    }
  }

  /**
   * Register an analyzer
   */
  registerAnalyzer(analyzer: Analyzer): void {
    if (this.analyzers.has(analyzer.name)) {
      throw new Error(`Analyzer "${analyzer.name}" is already registered`);
    }
    this.analyzers.set(analyzer.name, analyzer);
  }

  /**
   * Unregister an analyzer by name
   */
  unregisterAnalyzer(name: string): boolean {
    return this.analyzers.delete(name);
  }

  /**
   * Get all registered analyzers
   */
  getAnalyzers(): Analyzer[] {
    return Array.from(this.analyzers.values());
  }

  /**
   * Get analyzers for a specific phase
   */
  getAnalyzersForPhase(phase: AnalyzerPhase): Analyzer[] {
    return this.getAnalyzers().filter((a) => a.phase === phase);
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: PipelineEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: PipelineEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: PipelineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Run the analysis pipeline
   */
  async run(context: AnalysisContext): Promise<PipelineResult> {
    const startTime = Date.now();
    const allResults: AnalysisResult[] = [];
    const errors: string[] = [];

    // Filter analyzers based on config
    const enabledAnalyzers = this.getEnabledAnalyzers(context);

    // Run each phase in order
    for (const phase of PHASE_ORDER) {
      const phaseAnalyzers = enabledAnalyzers.filter((a) => a.phase === phase);

      if (phaseAnalyzers.length === 0) {
        continue;
      }

      this.emit({ type: 'phase-start', phase });

      const phaseResults: AnalysisResult[] = [];

      // Augment context with previous results for later phases
      const augmentedContext = {
        ...context,
        _previousResults: allResults,
      } as AnalysisContext & { _previousResults: AnalysisResult[] };

      if (this.options.parallel) {
        // Run analyzers in parallel
        const promises = phaseAnalyzers.map((analyzer) =>
          this.runAnalyzer(analyzer, augmentedContext)
        );
        const results = await Promise.allSettled(promises);

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const analyzer = phaseAnalyzers[i];

          if (result.status === 'fulfilled') {
            phaseResults.push(result.value);
          } else {
            errors.push(`${analyzer.name}: ${result.reason}`);
            this.emit({
              type: 'analyzer-error',
              analyzer: analyzer.name,
              error: result.reason,
            });

            if (this.options.failFast) {
              return this.createResult(allResults, startTime, errors);
            }
          }
        }
      } else {
        // Run analyzers sequentially
        for (const analyzer of phaseAnalyzers) {
          try {
            const result = await this.runAnalyzer(analyzer, augmentedContext);
            phaseResults.push(result);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            errors.push(`${analyzer.name}: ${errorMessage}`);
            this.emit({
              type: 'analyzer-error',
              analyzer: analyzer.name,
              error: error instanceof Error ? error : new Error(errorMessage),
            });

            if (this.options.failFast) {
              return this.createResult(allResults, startTime, errors);
            }
          }
        }
      }

      allResults.push(...phaseResults);
      this.emit({ type: 'phase-end', phase, results: phaseResults });
    }

    return this.createResult(allResults, startTime, errors);
  }

  /**
   * Run a single analyzer with timeout
   */
  private async runAnalyzer(
    analyzer: Analyzer,
    context: AnalysisContext
  ): Promise<AnalysisResult> {
    this.emit({ type: 'analyzer-start', analyzer: analyzer.name });

    const result = await Promise.race([
      analyzer.analyze(context),
      this.timeout(analyzer.name),
    ]);

    this.emit({ type: 'analyzer-end', analyzer: analyzer.name, result });

    return result;
  }

  /**
   * Create a timeout promise
   */
  private timeout(analyzerName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Analyzer "${analyzerName}" timed out`));
      }, this.options.timeout);
    });
  }

  /**
   * Get enabled analyzers based on config
   */
  private getEnabledAnalyzers(context: AnalysisContext): Analyzer[] {
    const { enabledAnalyzers, disabledAnalyzers } = context.config;
    let analyzers = this.getAnalyzers();

    if (enabledAnalyzers && enabledAnalyzers.length > 0) {
      // Only use explicitly enabled analyzers
      analyzers = analyzers.filter((a) => enabledAnalyzers.includes(a.name));
    }

    if (disabledAnalyzers && disabledAnalyzers.length > 0) {
      // Remove disabled analyzers
      analyzers = analyzers.filter((a) => !disabledAnalyzers.includes(a.name));
    }

    return analyzers;
  }

  /**
   * Create the final pipeline result
   */
  private createResult(
    results: AnalysisResult[],
    startTime: number,
    errors: string[]
  ): PipelineResult {
    return {
      results,
      duration: Date.now() - startTime,
      hasErrors: errors.length > 0,
      errors,
    };
  }
}

// Re-export types
export * from './types.js';
export { createStaticAnalyzer } from './static/index.js';
export { createAIAnalyzer } from './ai/index.js';
export { createDependencyAnalyzer } from './dependency/index.js';
