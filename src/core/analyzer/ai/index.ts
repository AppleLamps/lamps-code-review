/**
 * AI Analyzer module
 * Uses OpenRouter to perform AI-powered code review
 */

import * as fs from 'node:fs';
import type { AnalysisContext, AnalysisResult, AIConfig, Finding, Severity } from '../../../types/index.js';
import { BaseAnalyzer } from '../types.js';
import { chat, OpenRouterError } from './openrouter.js';
import { DEFAULT_SYSTEM_PROMPT, buildUserPrompt, parseAIResponse } from './prompts.js';
import { getOpenRouterKey, hasOpenRouterKey } from '../../config/index.js';

/** Maximum file size to include in AI analysis (100KB) */
const MAX_FILE_SIZE_FOR_AI = 100 * 1024;

/** Maximum total content size to send to AI (500KB) */
const MAX_TOTAL_CONTENT_SIZE = 500 * 1024;

/**
 * AI-powered code analyzer using OpenRouter
 */
export class AIAnalyzer extends BaseAnalyzer {
  readonly name = 'ai';
  readonly phase = 'ai' as const;
  readonly description = 'AI-powered code review using OpenRouter';

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

    try {
      // Load file contents
      const filesWithContent = await this.loadFileContents(context.files);

      if (filesWithContent.length === 0) {
        return this.createResult([], startTime, {
          skipped: true,
          reason: 'no-files',
        });
      }

      // Build the prompt
      const userPrompt = buildUserPrompt(
        filesWithContent,
        context.frameworks,
        this.config.customPrompt
      );

      // Call AI
      const apiKey = getOpenRouterKey();
      const response = await chat(
        DEFAULT_SYSTEM_PROMPT,
        userPrompt,
        this.config,
        apiKey
      );

      // Parse response
      const parsed = parseAIResponse(response);

      // Convert to findings
      const findings: Finding[] = parsed.findings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity as Severity,
        file: f.file,
        line: f.line,
        message: f.message,
        suggestion: f.suggestion,
      }));

      return this.createResult(findings, startTime, {
        model: this.config.model,
        summary: parsed.summary,
        filesAnalyzed: filesWithContent.length,
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
   * Load file contents for AI analysis
   * Respects size limits and filters appropriately
   */
  private async loadFileContents(
    files: AnalysisContext['files']
  ): Promise<AnalysisContext['files']> {
    const result: AnalysisContext['files'] = [];
    let totalSize = 0;

    // Sort by size (smaller files first) to maximize coverage
    const sortedFiles = [...files].sort((a, b) => a.size - b.size);

    for (const file of sortedFiles) {
      // Skip files that are too large
      if (file.size > MAX_FILE_SIZE_FOR_AI) {
        continue;
      }

      // Check total size limit
      if (totalSize + file.size > MAX_TOTAL_CONTENT_SIZE) {
        break;
      }

      try {
        // Load content if not already loaded
        let content = file.content;
        if (content === undefined) {
          content = await fs.promises.readFile(file.path, 'utf-8');
        }

        result.push({
          ...file,
          content,
        });

        totalSize += file.size;
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    return result;
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
