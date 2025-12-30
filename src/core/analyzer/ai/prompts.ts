/**
 * AI review prompts
 * Contains the system and user prompts for code review
 */

import type { DetectionResult, FileInfo } from '../../../types/index.js';

/**
 * Default system prompt for code review
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an expert senior software engineer conducting a thorough code review. Your goal is to identify issues that matter and provide actionable feedback.

Focus on:
1. **Security vulnerabilities** - SQL injection, XSS, command injection, auth issues, secrets exposure
2. **Bugs and logic errors** - Off-by-one errors, null/undefined handling, race conditions
3. **Performance issues** - N+1 queries, memory leaks, unnecessary re-renders, inefficient algorithms
4. **Code quality** - Complexity, readability, maintainability, code smells
5. **Best practices** - Framework-specific patterns, TypeScript/Python idioms, error handling
6. **Architecture** - Coupling, cohesion, separation of concerns, scalability

Be specific and actionable. Don't nitpick style issues unless they affect readability significantly.

You MUST respond with valid JSON only. No markdown, no explanations outside the JSON.`;

/**
 * Build the user prompt with codebase content
 */
export function buildUserPrompt(
  files: FileInfo[],
  frameworks: DetectionResult,
  customPrompt?: string
): string {
  const frameworkList = frameworks.frameworks
    .map((f) => `${f.framework} (${Math.round(f.confidence * 100)}%)`)
    .join(', ');

  const languageList = frameworks.languages.join(', ');

  let prompt = '';

  // Add custom prompt if provided
  if (customPrompt) {
    prompt += `## Additional Review Instructions\n${customPrompt}\n\n`;
  }

  prompt += `## Codebase Information
- **Primary Framework**: ${frameworks.primary || 'None detected'}
- **All Frameworks**: ${frameworkList || 'None detected'}
- **Languages**: ${languageList || 'Unknown'}
- **Files to Review**: ${files.length}

## Files

`;

  // Add file contents
  for (const file of files) {
    if (file.content) {
      prompt += `### ${file.relativePath}\n\`\`\`${getLanguageId(file.extension)}\n${file.content}\n\`\`\`\n\n`;
    }
  }

  prompt += `## Response Format

Respond with a JSON object containing your findings:

\`\`\`json
{
  "findings": [
    {
      "ruleId": "ai/<category>-<specific-issue>",
      "severity": "error" | "warning" | "info" | "hint",
      "file": "relative/path/to/file.ts",
      "line": 42,
      "message": "Clear description of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ],
  "summary": "Brief overall assessment of the codebase"
}
\`\`\`

Rule ID categories:
- \`ai/security-*\` for security issues
- \`ai/bug-*\` for bugs and logic errors
- \`ai/perf-*\` for performance issues
- \`ai/quality-*\` for code quality issues
- \`ai/practice-*\` for best practice violations
- \`ai/arch-*\` for architectural concerns

Severity levels:
- \`error\`: Critical issues that must be fixed (security vulnerabilities, definite bugs)
- \`warning\`: Important issues that should be addressed (potential bugs, performance problems)
- \`info\`: Suggestions for improvement (code quality, best practices)
- \`hint\`: Minor observations (style, optional improvements)

If there are no issues, return: {"findings": [], "summary": "No significant issues found."}`;

  return prompt;
}

/**
 * Map file extension to language identifier for syntax highlighting
 */
function getLanguageId(extension: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.py': 'python',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.vue': 'vue',
    '.svelte': 'svelte',
  };
  return map[extension] || extension.slice(1) || 'text';
}

/**
 * Parse AI response into structured findings
 */
export interface AIReviewResponse {
  findings: Array<{
    ruleId: string;
    severity: string;
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  summary: string;
}

/**
 * Parse the AI response, handling various formats
 */
export function parseAIResponse(response: string): AIReviewResponse {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr) as AIReviewResponse;

    // Validate structure
    if (!Array.isArray(parsed.findings)) {
      return { findings: [], summary: 'Failed to parse AI response' };
    }

    // Normalize findings
    parsed.findings = parsed.findings.map((f) => ({
      ruleId: f.ruleId || 'ai/unknown',
      severity: normalizeSeverity(f.severity),
      file: f.file || 'unknown',
      line: typeof f.line === 'number' ? f.line : undefined,
      message: f.message || 'No description provided',
      suggestion: f.suggestion,
    }));

    return parsed;
  } catch {
    // Return empty findings if parsing fails
    return {
      findings: [],
      summary: 'Failed to parse AI response: ' + response.slice(0, 200),
    };
  }
}

/**
 * Normalize severity to valid values
 */
function normalizeSeverity(severity: string): string {
  const normalized = severity?.toLowerCase();
  if (['error', 'warning', 'info', 'hint'].includes(normalized)) {
    return normalized;
  }
  // Map common alternatives
  if (normalized === 'critical' || normalized === 'high') return 'error';
  if (normalized === 'medium') return 'warning';
  if (normalized === 'low') return 'info';
  return 'info';
}
