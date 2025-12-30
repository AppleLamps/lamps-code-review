#!/usr/bin/env node
/**
 * LampsCodeReview CLI
 * Command-line interface for running code reviews
 */

import { Command } from 'commander';
import { executeReview } from './commands/review.js';

// Package version (will be replaced by actual version in production)
const VERSION = '0.1.0';

const program = new Command();

program
  .name('lamps-review')
  .description('AI-powered code review for modern web codebases')
  .version(VERSION);

program
  .command('review')
  .description('Run a code review on a repository or directory')
  .argument('<path>', 'Path to the repository or directory to review')
  .option('-o, --output <file>', 'Write report to file instead of stdout')
  .option(
    '-f, --format <format>',
    'Output format: json, markdown, html',
    'json'
  )
  .option('-m, --model <model>', 'Override AI model (e.g., openai/gpt-4o)')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-c, --config <file>', 'Path to config file')
  .action(async (targetPath: string, options) => {
    await executeReview(targetPath, options);
  });

// Default command: run review on current directory
program
  .argument('[path]', 'Path to review (defaults to current directory)', '.')
  .option('-o, --output <file>', 'Write report to file instead of stdout')
  .option(
    '-f, --format <format>',
    'Output format: json, markdown, html',
    'json'
  )
  .option('-m, --model <model>', 'Override AI model (e.g., openai/gpt-4o)')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (targetPath: string, options) => {
    await executeReview(targetPath, options);
  });

// Parse and execute
program.parse();
