/**
 * Review command implementation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LampsCodeReview } from '../../index.js';
import type { CLIOptions, ReportFormat } from '../../types/index.js';

/**
 * Execute the review command
 */
export async function executeReview(
  targetPath: string,
  options: CLIOptions
): Promise<void> {
  const absolutePath = path.resolve(targetPath);

  // Validate path exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Path does not exist: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`\n🔍 LampsCodeReview - Analyzing: ${absolutePath}\n`);

  // Show AI model info
  if (options.model) {
    console.log(`🤖 AI Model: ${options.model}\n`);
  }

  try {
    // Create reviewer instance
    const reviewer = new LampsCodeReview({
      verbose: options.verbose,
      format: options.format as ReportFormat,
      output: options.output,
      ai: options.model ? { model: options.model } : undefined,
    });

    // Run the review
    const startTime = Date.now();
    const report = await reviewer.review(absolutePath);
    const duration = Date.now() - startTime;

    // Output results
    if (options.output) {
      // Write to file
      const formatted = reviewer.formatReport(
        report,
        options.format as ReportFormat || 'json'
      );
      fs.writeFileSync(options.output, formatted);
      console.log(`📄 Report written to: ${options.output}`);
    } else {
      // Print summary to console
      printSummary(report, duration);
    }

    // Exit with error code if there are errors
    if (report.summary.bySeverity.error > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during review:', error);
    process.exit(1);
  }
}

/**
 * Print a summary of the review to console
 */
function printSummary(
  report: Awaited<ReturnType<LampsCodeReview['review']>>,
  duration: number
): void {
  console.log('━'.repeat(50));
  console.log('📊 Review Summary');
  console.log('━'.repeat(50));

  // Health score with color
  const score = report.summary.healthScore;
  const scoreColor = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
  console.log(`\n${scoreColor} Health Score: ${score}/100`);

  // Files analyzed
  console.log(`📁 Files Analyzed: ${report.repository.filesAnalyzed}`);

  // Frameworks detected
  if (report.frameworks.frameworks.length > 0) {
    console.log('\n🔧 Frameworks Detected:');
    for (const fw of report.frameworks.frameworks) {
      const confidence = Math.round(fw.confidence * 100);
      console.log(`   • ${fw.framework} (${confidence}%)`);
    }
  }

  // Findings summary
  const { bySeverity } = report.summary;
  console.log('\n📋 Findings:');
  if (bySeverity.error > 0) console.log(`   ❌ Errors: ${bySeverity.error}`);
  if (bySeverity.warning > 0) console.log(`   ⚠️  Warnings: ${bySeverity.warning}`);
  if (bySeverity.info > 0) console.log(`   ℹ️  Info: ${bySeverity.info}`);
  if (bySeverity.hint > 0) console.log(`   💡 Hints: ${bySeverity.hint}`);

  if (report.summary.totalFindings === 0) {
    console.log('   ✨ No issues found!');
  }

  // Print individual findings
  if (report.findings.length > 0 && report.findings.length <= 10) {
    console.log('\n📝 Details:');
    for (const finding of report.findings) {
      const icon =
        finding.severity === 'error'
          ? '❌'
          : finding.severity === 'warning'
            ? '⚠️'
            : finding.severity === 'info'
              ? 'ℹ️'
              : '💡';
      console.log(`\n   ${icon} [${finding.ruleId}]`);
      console.log(`      ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
      console.log(`      ${finding.message}`);
    }
  } else if (report.findings.length > 10) {
    console.log(`\n   (${report.findings.length} findings - use --output to see all)`);
  }

  // Duration
  console.log(`\n⏱️  Completed in ${duration}ms`);
  console.log('━'.repeat(50));
}
