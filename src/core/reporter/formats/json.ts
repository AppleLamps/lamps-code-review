/**
 * JSON report formatter
 */

import type { ReviewReport } from '../../../types/index.js';

/**
 * Format a report as JSON string
 */
export function formatJson(report: ReviewReport, pretty: boolean = true): string {
  if (pretty) {
    return JSON.stringify(report, null, 2);
  }
  return JSON.stringify(report);
}

/**
 * Parse a JSON report string back to a ReviewReport object
 */
export function parseJsonReport(json: string): ReviewReport {
  return JSON.parse(json) as ReviewReport;
}
