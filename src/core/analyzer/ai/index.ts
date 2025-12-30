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

    // Check for API key
    if (!hasOpenRouterKey()) {
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
      return this.createResult([], startTime, {
        skipped: true,
        reason: 'no-files',
      });
    }

    try {
      // Get dependency graph from static phase results (if available)
      // This will be set by the pipeline from previous phase results
      const graph = this.getDependencyGraph(context) || createEmptyGraph(context.files);

      // Collect static findings for context
      this.staticFindings = this.getStaticFindings(context);

      // Run all passes
      const allPassResults: AIPassResult[] = [];
      const allFindings: Finding[] = [];

      // Log start
      if (context.config.verbose) {
        console.log('Starting multi-pass AI analysis...');
      }

      // Pass 1: Architecture
      const archResult = await this.runPass('architecture', context, graph, allFindings);
      allPassResults.push(archResult);
      allFindings.push(...archResult.findings);

      if (context.config.verbose) {
        console.log(`  Architecture pass: ${archResult.findings.length} findings`);
      }

      // Pass 2: Deep Dive
      const deepResult = await this.runPass('deep-dive', context, graph, allFindings);
      allPassResults.push(deepResult);
      allFindings.push(...deepResult.findings);

      if (context.config.verbose) {
        console.log(`  Deep-dive pass: ${deepResult.findings.length} findings`);
      }

      // Pass 3: Security
      const secResult = await this.runPass('security', context, graph, allFindings);
      allPassResults.push(secResult);
      allFindings.push(...secResult.findings);

      if (context.config.verbose) {
        console.log(`  Security pass: ${secResult.findings.length} findings`);
      }

      // Deduplicate findings
      const dedupedFindings = this.deduplicateFindings(allFindings);

      // Combine summaries
      const combinedSummary = allPassResults
        .map((r) => `**${r.pass}**: ${r.summary}`)
        .join('\n\n');

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

    // Skip if no files to review
    if (reviewContext.files.length === 0) {
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
    const apiKey = getOpenRouterKey();
    const response = await chat(systemPrompt, userPrompt, this.config, apiKey);

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
