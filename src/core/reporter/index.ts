/**
 * Report generation module
 * Transforms analysis results into structured output
 */

import type {
  AnalysisResult,
  DetectionResult,
  Finding,
  ReportFormat,
  ReportSummary,
  ReviewReport,
  Severity,
} from '../../types/index.js';
import { formatJson } from './formats/json.js';

/** Current report version */
const REPORT_VERSION = '1.0.0';

/**
 * Generate a review report from analysis results
 */
export function generateReport(
  rootPath: string,
  filesAnalyzed: number,
  frameworks: DetectionResult,
  analyzerResults: AnalysisResult[]
): ReviewReport {
  // Collect all findings from all analyzers
  const allFindings: Finding[] = [];
  for (const result of analyzerResults) {
    allFindings.push(...result.findings);
  }

  // Generate summary
  const summary = generateSummary(allFindings, analyzerResults);

  return {
    version: REPORT_VERSION,
    timestamp: new Date().toISOString(),
    repository: {
      path: rootPath,
      filesAnalyzed,
    },
    frameworks,
    summary,
    findings: allFindings,
    analyzerResults,
  };
}

/**
 * Generate summary statistics from findings
 */
function generateSummary(
  findings: Finding[],
  analyzerResults: AnalysisResult[]
): ReportSummary {
  // Count by severity
  const bySeverity: Record<Severity, number> = {
    error: 0,
    warning: 0,
    info: 0,
    hint: 0,
  };

  for (const finding of findings) {
    bySeverity[finding.severity]++;
  }

  // Count by analyzer
  const byAnalyzer: Record<string, number> = {};
  for (const result of analyzerResults) {
    byAnalyzer[result.analyzerName] = result.findings.length;
  }

  // Calculate health score (simple algorithm)
  const healthScore = calculateHealthScore(findings);

  return {
    totalFindings: findings.length,
    bySeverity,
    byAnalyzer,
    healthScore,
  };
}

/**
 * Calculate a health score from 0-100
 * Higher score = healthier codebase
 */
function calculateHealthScore(findings: Finding[]): number {
  if (findings.length === 0) {
    return 100;
  }

  // Weight by severity
  const weights: Record<Severity, number> = {
    error: 10,
    warning: 5,
    info: 2,
    hint: 1,
  };

  let totalWeight = 0;
  for (const finding of findings) {
    totalWeight += weights[finding.severity];
  }

  // Score decreases with more/worse findings
  // Max penalty is 100 points
  const penalty = Math.min(totalWeight, 100);
  return Math.max(0, 100 - penalty);
}

/**
 * Format a report to a specific output format
 */
export function formatReport(
  report: ReviewReport,
  format: ReportFormat
): string {
  switch (format) {
    case 'json':
      return formatJson(report);

    case 'markdown':
      // TODO(feature): Implement Markdown formatter
      return formatMarkdownPlaceholder(report);

    case 'html':
      // TODO(feature): Implement HTML formatter
      return formatHtmlPlaceholder(report);

    default:
      return formatJson(report);
  }
}

/**
 * Placeholder Markdown formatter
 */
function formatMarkdownPlaceholder(report: ReviewReport): string {
  const lines: string[] = [
    '# Code Review Report',
    '',
    `**Generated:** ${report.timestamp}`,
    `**Repository:** ${report.repository.path}`,
    `**Files Analyzed:** ${report.repository.filesAnalyzed}`,
    '',
    '## Summary',
    '',
    `- **Health Score:** ${report.summary.healthScore}/100`,
    `- **Total Findings:** ${report.summary.totalFindings}`,
    `  - Errors: ${report.summary.bySeverity.error}`,
    `  - Warnings: ${report.summary.bySeverity.warning}`,
    `  - Info: ${report.summary.bySeverity.info}`,
    `  - Hints: ${report.summary.bySeverity.hint}`,
    '',
    '## Frameworks Detected',
    '',
  ];

  for (const fw of report.frameworks.frameworks) {
    lines.push(`- **${fw.framework}** (${Math.round(fw.confidence * 100)}% confidence)`);
  }

  if (report.findings.length > 0) {
    lines.push('', '## Findings', '');
    for (const finding of report.findings) {
      lines.push(`### ${finding.severity.toUpperCase()}: ${finding.ruleId}`);
      lines.push(`- **File:** ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
      lines.push(`- **Message:** ${finding.message}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Placeholder HTML formatter
 */
function formatHtmlPlaceholder(report: ReviewReport): string {
  // TODO(feature): Implement proper HTML template
  return `<!DOCTYPE html>
<html>
<head>
  <title>Code Review Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .score { font-size: 2em; font-weight: bold; }
    .error { color: red; }
    .warning { color: orange; }
    .info { color: blue; }
    .hint { color: gray; }
  </style>
</head>
<body>
  <h1>Code Review Report</h1>
  <p>Generated: ${report.timestamp}</p>
  <p>Repository: ${report.repository.path}</p>
  <p class="score">Health Score: ${report.summary.healthScore}/100</p>
  <h2>Summary</h2>
  <ul>
    <li>Total Findings: ${report.summary.totalFindings}</li>
    <li class="error">Errors: ${report.summary.bySeverity.error}</li>
    <li class="warning">Warnings: ${report.summary.bySeverity.warning}</li>
    <li class="info">Info: ${report.summary.bySeverity.info}</li>
    <li class="hint">Hints: ${report.summary.bySeverity.hint}</li>
  </ul>
  <h2>Findings</h2>
  <pre>${JSON.stringify(report.findings, null, 2)}</pre>
</body>
</html>`;
}

// Re-export formatters
export { formatJson, parseJsonReport } from './formats/json.js';
