/**
 * AI Analyzer module
 * Multi-pass AI-powered code review using OpenRouter
 */

import type {
  AnalysisContext,
  AnalysisResult,
  AIConfig,
  Finding,
  Severity,
  AIPassType,
  ReviewContext,
  AIPassResult,
} from '../../../types/index.js';
import { BaseAnalyzer } from '../types.js';
import { chat, OpenRouterError } from './openrouter.js';
import { getOpenRouterKey, hasOpenRouterKey } from '../../config/index.js';
import {
  buildArchitectureContext,
  buildDeepDiveContext,
  buildSecurityContext,
  getDependencyGraphFromResults,
  createEmptyGraph,
} from './context.js';
import { PASS_SYSTEM_PROMPTS, buildPassPrompt } from './passes.js';
import { parseAIResponse } from './prompts.js';
import { createLogger } from '../../../utils/logger.js';


/**
 * Multi-pass AI-powered code analyzer using OpenRouter
 */
export class AIAnalyzer extends BaseAnalyzer {
  readonly name = 'ai';
  readonly phase = 'ai' as const;
  readonly description = 'Multi-pass AI-powered code review using OpenRouter';

  /** Store static analysis findings from previous phase */
  private staticFindings: Finding[] = [];

  constructor(private config: AIConfig) {
    super();
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const logger = context.logger || createLogger(false);

    // Check for API key
    if (!hasOpenRouterKey()) {
      logger.warn('OPENROUTER_API_KEY not set - skipping AI analysis');
      return this.createResult(
        [
          {
            ruleId: 'ai/no-api-key',
            severity: 'info' as Severity,
            file: '',
            message:
              'AI analysis skipped: OPENROUTER_API_KEY environment variable not set',
          },
        ],
        startTime,
        { skipped: true, reason: 'no-api-key' }
      );
    }

    if (context.files.length === 0) {
      logger.warn('No files to analyze');
      return this.createResult([], startTime, {
        skipped: true,
        reason: 'no-files',
      });
    }

    try {
      logger.phase('AI Analysis (Multi-Pass)');
      logger.step(`Model: ${this.config.model}`);
      logger.step(`Files in codebase: ${context.files.length}`);

      // Get dependency graph from static phase results (if available)
      const graph = this.getDependencyGraph(context) || createEmptyGraph(context.files);

      // Log graph stats
      const graphStats = {
        entryPoints: graph.entryPoints.length,
        configFiles: graph.configFiles.length,
        apiFiles: graph.apiFiles.length,
      };
      logger.detail(`Dependency graph: ${graphStats.entryPoints} entry points, ${graphStats.configFiles} configs, ${graphStats.apiFiles} API routes`);

      // Collect static findings for context
      this.staticFindings = this.getStaticFindings(context);
      if (this.staticFindings.length > 0) {
        logger.detail(`Static findings to incorporate: ${this.staticFindings.length}`);
      }

      // Run all passes
      const allPassResults: AIPassResult[] = [];
      const allFindings: Finding[] = [];

      // Pass 1: Architecture
      logger.step('Pass 1/3: Architecture Review');
      const archResult = await this.runPass('architecture', context, graph, allFindings);
      allPassResults.push(archResult);
      allFindings.push(...archResult.findings);
      logger.success(`Architecture: ${archResult.findings.length} findings`);

      // Pass 2: Deep Dive
      logger.step('Pass 2/3: Deep Dive Review');
      const deepResult = await this.runPass('deep-dive', context, graph, allFindings);
      allPassResults.push(deepResult);
      allFindings.push(...deepResult.findings);
      logger.success(`Deep-dive: ${deepResult.findings.length} findings`);

      // Pass 3: Security
      logger.step('Pass 3/3: Security Review');
      const secResult = await this.runPass('security', context, graph, allFindings);
      allPassResults.push(secResult);
      allFindings.push(...secResult.findings);
      logger.success(`Security: ${secResult.findings.length} findings`);

      // Deduplicate findings
      const dedupedFindings = this.deduplicateFindings(allFindings);
      if (allFindings.length !== dedupedFindings.length) {
        logger.detail(`Deduplicated: ${allFindings.length} → ${dedupedFindings.length} findings`);
      }

      // Combine summaries
      const combinedSummary = allPassResults
        .map((r) => `**${r.pass}**: ${r.summary}`)
        .join('\n\n');

      const duration = Date.now() - startTime;
      logger.success(`AI analysis complete in ${(duration / 1000).toFixed(1)}s`);

      return this.createResult(dedupedFindings, startTime, {
        model: this.config.model,
        summary: combinedSummary,
        passResults: allPassResults,
        filesAnalyzed: context.files.length,
        multiPass: true,
      });
    } catch (error) {
      // Handle errors gracefully
      const errorMessage =
        error instanceof OpenRouterError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown error during AI analysis';

      logger.warn(`AI analysis failed: ${errorMessage}`);

      return this.createResult(
        [
          {
            ruleId: 'ai/error',
            severity: 'warning' as Severity,
            file: '',
            message: `AI analysis failed: ${errorMessage}`,
          },
        ],
        startTime,
        { error: errorMessage }
      );
    }
  }

  /**
   * Run a single AI pass
   */
  private async runPass(
    passType: AIPassType,
    context: AnalysisContext,
    graph: ReturnType<typeof createEmptyGraph>,
    previousFindings: Finding[]
  ): Promise<AIPassResult> {
    const logger = context.logger || createLogger(false);

    // Build context for this pass
    let reviewContext: ReviewContext;

    switch (passType) {
      case 'architecture':
        reviewContext = await buildArchitectureContext(context, graph);
        break;
      case 'deep-dive':
        reviewContext = await buildDeepDiveContext(
          context,
          graph,
          this.staticFindings,
          previousFindings.filter((f) => f.ruleId.startsWith('ai/arch'))
        );
        break;
      case 'security':
        reviewContext = await buildSecurityContext(context, graph);
        break;
    }

    // Log context details
    logger.detail(`Sending ${reviewContext.files.length} files (~${Math.round(reviewContext.metadata.totalTokenEstimate / 1000)}K tokens)`);
    if (reviewContext.files.length > 0 && reviewContext.files.length <= 5) {
      for (const file of reviewContext.files) {
        logger.detail(`  ${file.path} (${file.reason})`);
      }
    } else if (reviewContext.files.length > 5) {
      for (const file of reviewContext.files.slice(0, 3)) {
        logger.detail(`  ${file.path} (${file.reason})`);
      }
      logger.detail(`  ... and ${reviewContext.files.length - 3} more files`);
    }

    // Skip if no files to review
    if (reviewContext.files.length === 0) {
      logger.warn(`No relevant files for ${passType} review`);
      return {
        pass: passType,
        findings: [],
        summary: `No relevant files for ${passType} review`,
      };
    }

    // Build prompts
    const systemPrompt = PASS_SYSTEM_PROMPTS[passType];
    const userPrompt = buildPassPrompt(reviewContext, this.config.customPrompt);

    // Call AI
    logger.detail('Calling AI...');
    const callStart = Date.now();
    const apiKey = getOpenRouterKey();
    const response = await chat(systemPrompt, userPrompt, this.config, apiKey);
    const callDuration = Date.now() - callStart;
    logger.detail(`AI responded in ${(callDuration / 1000).toFixed(1)}s`);

    // Parse response
    const parsed = parseAIResponse(response);

    // Convert to findings with proper severity types
    const findings: Finding[] = parsed.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity as Severity,
      file: f.file,
      line: f.line,
      message: f.message,
      suggestion: f.suggestion,
    }));

    return {
      pass: passType,
      findings,
      summary: parsed.summary,
    };
  }

  /**
   * Get dependency graph from context or previous results
   */
  private getDependencyGraph(context: AnalysisContext): ReturnType<typeof createEmptyGraph> | null {
    // The dependency graph is stored in the context by the pipeline
    // after the static phase runs
    const metadata = (context as AnalysisContext & { _previousResults?: AnalysisResult[] })._previousResults;
    if (metadata) {
      return getDependencyGraphFromResults(metadata);
    }
    return null;
  }

  /**
   * Get static findings from previous phase
   */
  private getStaticFindings(context: AnalysisContext): Finding[] {
    const metadata = (context as AnalysisContext & { _previousResults?: AnalysisResult[] })._previousResults;
    if (!metadata) return [];

    const staticResult = metadata.find((r) => r.analyzerName === 'static');
    return staticResult?.findings || [];
  }

  /**
   * Deduplicate findings from multiple passes
   * Keeps the highest severity if duplicates found
   */
  private deduplicateFindings(findings: Finding[]): Finding[] {
    const seen = new Map<string, Finding>();
    const severityOrder: Record<Severity, number> = {
      error: 4,
      warning: 3,
      info: 2,
      hint: 1,
    };

    for (const finding of findings) {
      // Create a key based on file, line, and message similarity
      const key = `${finding.file}:${finding.line || 0}:${this.normalizeMessage(finding.message)}`;

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, finding);
      } else {
        // Keep the one with higher severity
        if (severityOrder[finding.severity] > severityOrder[existing.severity]) {
          seen.set(key, finding);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Normalize message for deduplication comparison
   */
  private normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .slice(0, 50);
  }
}

/**
 * Create an AI analyzer with the given configuration
 */
export function createAIAnalyzer(config: AIConfig): AIAnalyzer {
  return new AIAnalyzer(config);
}

// Re-export for convenience
export { OpenRouterError } from './openrouter.js';
