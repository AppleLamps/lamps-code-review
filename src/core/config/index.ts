/**
 * Configuration loader module
 * Loads and merges configuration from lamps.config.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LampsConfig, AIConfig } from '../../types/index.js';
import { DEFAULT_AI_CONFIG } from '../../types/index.js';

/** Config file name */
const CONFIG_FILE_NAME = 'lamps.config.json';

/**
 * Load configuration from lamps.config.json in the target directory
 * Falls back to defaults if no config file exists
 */
export async function loadConfig(rootPath: string): Promise<LampsConfig> {
  // Resolve to absolute path to prevent traversal issues
  const resolvedRoot = path.resolve(rootPath);
  const configPath = path.join(resolvedRoot, CONFIG_FILE_NAME);

  // Ensure config path is within the root directory (prevent path traversal)
  const resolvedConfig = path.resolve(configPath);
  if (!resolvedConfig.startsWith(resolvedRoot)) {
    // Config path escaped root directory - ignore
    return {};
  }

  try {
    const content = await fs.promises.readFile(resolvedConfig, 'utf-8');
    const config = JSON.parse(content) as LampsConfig;
    return config;
  } catch {
    // No config file or invalid JSON - return empty config (will use defaults)
    return {};
  }
}

/**
 * Merge user AI config with defaults
 */
export function mergeAIConfig(userConfig?: Partial<AIConfig>): AIConfig {
  return {
    ...DEFAULT_AI_CONFIG,
    ...userConfig,
  };
}

/**
 * Check if OpenRouter API key is available
 */
export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * Get OpenRouter API key from environment
 * @throws Error if key is not set
 */
export function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY environment variable is not set. ' +
      'Set it to enable AI-powered code review.'
    );
  }
  return key;
}

/**
 * Validate AI configuration
 */
export function validateAIConfig(config: AIConfig): string[] {
  const errors: string[] = [];

  if (!config.model || typeof config.model !== 'string') {
    errors.push('AI model must be a non-empty string');
  }

  if (config.maxTokens < 1 || config.maxTokens > 100000) {
    errors.push('maxTokens must be between 1 and 100000');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('temperature must be between 0 and 2');
  }

  return errors;
}
