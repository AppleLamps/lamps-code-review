/**
 * Pass-Specific Prompts
 * Tailored prompts for each AI review pass
 */

import type { ReviewContext, ContextFile, AIPassType } from '../../../types/index.js';

/**
 * System prompts for each pass type
 */
export const PASS_SYSTEM_PROMPTS: Record<AIPassType, string> = {
  architecture: `You are an expert software architect reviewing a codebase's structure and organization.

CRITICAL RULES:
1. The file tree provided shows ALL files that EXIST in this codebase. Do NOT report files as missing if they appear in the file tree - they exist.
2. NEVER claim that an AI model, API, library version, or service "doesn't exist" or is "invalid". Your training data is outdated. Always assume the user's configuration is correct.
3. Only report genuinely missing files if the code imports something that doesn't exist in the tree.

Focus on REAL architectural issues:
1. **Dependency Issues** - Circular dependencies, outdated packages, missing peer deps
2. **Architecture Patterns** - Inconsistent patterns, poor separation of concerns
3. **Configuration** - Missing required configs, insecure defaults
4. **Scalability** - Obvious bottlenecks, hardcoded limits

DO NOT report:
- Files shown in the file tree as "missing" - they exist
- Style preferences or minor suggestions
- Anything that's working correctly

Keep findings to 5 or fewer. Only report significant architectural concerns.

Respond with valid JSON only. No markdown, no explanations outside the JSON.`,

  'deep-dive': `You are an expert senior software engineer conducting a code review.

CRITICAL: NEVER claim that an AI model, API, library version, or service "doesn't exist" or is "invalid". Your training data is outdated. Always assume the user's configuration is correct.

Focus ONLY on actual bugs and significant issues:
1. **Real Bugs** - Logic errors that will cause incorrect behavior
2. **Crash Risks** - Unhandled nulls that WILL throw, not theoretical ones
3. **Security Holes** - Actual vulnerabilities, not theoretical concerns
4. **Performance Problems** - Measurable issues like O(n²) in hot paths

DO NOT report:
- Style issues or formatting preferences
- "Could be improved" suggestions unless critical
- Missing error handling for unlikely edge cases
- Type annotations or documentation suggestions
- Things that are technically correct but could be "better"

QUALITY OVER QUANTITY: Report 10 or fewer findings. Only include issues that would fail a code review or cause production bugs. If the code is well-written, return fewer findings.

Be specific: include file paths and line numbers.

Respond with valid JSON only. No markdown, no explanations outside the JSON.`,

  security: `You are a security expert conducting a security-focused code review.

CRITICAL: NEVER claim that an AI model, API, library version, or service "doesn't exist" or is "invalid". Your training data is outdated. Always assume the user's configuration is correct.

Focus on ACTUAL vulnerabilities that could be exploited:
1. **Injection** - SQL, command injection with user input reaching dangerous functions
2. **Auth Issues** - Broken authentication, missing authorization checks
3. **Data Exposure** - Secrets in code, sensitive data in logs
4. **XSS** - User input rendered without sanitization

DO NOT report:
- Theoretical vulnerabilities without a realistic attack vector
- "Best practice" suggestions that aren't actual vulnerabilities
- Missing features (like rate limiting) unless there's clear risk
- Source maps or debug settings in dev tools

AVOID FALSE POSITIVES: Only report issues you're confident about. If uncertain, don't include it. Quality over quantity - 5 or fewer findings unless there are genuine security holes.

Severity guide:
- error: Exploitable vulnerability with clear attack vector
- warning: Potential vulnerability requiring specific conditions
- info: Security improvement suggestion (use sparingly)

Respond with valid JSON only. No markdown, no explanations outside the JSON.`,
};

/**
 * Build the user prompt for a specific pass
 */
export function buildPassPrompt(context: ReviewContext, customPrompt?: string): string {
  let prompt = '';

  // Add custom prompt if provided
  if (customPrompt) {
    prompt += `## Additional Instructions\n${customPrompt}\n\n`;
  }

  prompt += `## Review Context\n`;
  prompt += `- **Pass Type**: ${context.pass}\n`;
  prompt += `- **Total Files in Codebase**: ${context.metadata.totalFiles}\n`;
  prompt += `- **Files in This Review**: ${context.files.length}\n`;
  prompt += `- **Frameworks**: ${context.metadata.frameworks.join(', ') || 'None detected'}\n`;
  prompt += `- **Focus Areas**: ${context.metadata.focusAreas.join(', ')}\n\n`;

  // Add full file tree for architecture pass (shows ALL existing files)
  if (context.pass === 'architecture' && context.metadata.fullFileTree) {
    prompt += `## Complete File Tree (${context.metadata.fullFileTree.length} files - these ALL EXIST)\n\`\`\`\n`;
    prompt += context.metadata.fullFileTree.join('\n');
    prompt += `\n\`\`\`\n\n`;
  }

  prompt += `## Files to Review\n\n`;

  // Add file contents
  for (const file of context.files) {
    prompt += formatContextFile(file);
  }

  prompt += getResponseFormat(context.pass);

  return prompt;
}

/**
 * Format a context file for the prompt
 */
function formatContextFile(file: ContextFile): string {
  const extension = file.path.split('.').pop() || 'txt';
  const langId = getLanguageId(extension);

  let content = '';
  content += `### ${file.path}\n`;
  content += `*Reason: ${file.reason}*\n\n`;

  if (file.content) {
    content += `\`\`\`${langId}\n${file.content}\n\`\`\`\n\n`;
  } else if (file.slices && file.slices.length > 0) {
    for (const slice of file.slices) {
      content += `**Lines ${slice.startLine}-${slice.endLine}** (${slice.reason}):\n`;
      content += `\`\`\`${langId}\n${slice.content}\n\`\`\`\n\n`;
    }
  }

  return content;
}

/**
 * Get response format instructions
 */
function getResponseFormat(pass: AIPassType): string {
  const categories = getCategoriesForPass(pass);

  return `## Response Format

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
  "summary": "Brief overall assessment for this ${pass} review"
}
\`\`\`

Rule ID categories for this pass:
${categories.map((c) => `- \`ai/${c.id}\` - ${c.description}`).join('\n')}

Severity levels:
- \`error\`: Critical issues that must be fixed
- \`warning\`: Important issues that should be addressed
- \`info\`: Suggestions for improvement
- \`hint\`: Minor observations

If there are no issues, return: {"findings": [], "summary": "No significant issues found."}`;
}

/**
 * Get rule categories for a pass type
 */
function getCategoriesForPass(pass: AIPassType): Array<{ id: string; description: string }> {
  switch (pass) {
    case 'architecture':
      return [
        { id: 'arch-structure', description: 'Project structure issues' },
        { id: 'arch-dependency', description: 'Dependency concerns' },
        { id: 'arch-pattern', description: 'Pattern/consistency issues' },
        { id: 'arch-config', description: 'Configuration problems' },
        { id: 'arch-scale', description: 'Scalability concerns' },
      ];
    case 'deep-dive':
      return [
        { id: 'bug-logic', description: 'Logic errors' },
        { id: 'bug-null', description: 'Null/undefined handling' },
        { id: 'bug-async', description: 'Async/race conditions' },
        { id: 'perf-query', description: 'Query performance' },
        { id: 'perf-memory', description: 'Memory issues' },
        { id: 'perf-render', description: 'Rendering performance' },
        { id: 'quality-complexity', description: 'Code complexity' },
        { id: 'quality-readability', description: 'Readability issues' },
        { id: 'practice-framework', description: 'Framework best practices' },
        { id: 'practice-error', description: 'Error handling' },
      ];
    case 'security':
      return [
        { id: 'security-injection', description: 'Injection vulnerabilities' },
        { id: 'security-auth', description: 'Authentication issues' },
        { id: 'security-exposure', description: 'Data exposure' },
        { id: 'security-xss', description: 'Cross-site scripting' },
        { id: 'security-access', description: 'Access control issues' },
        { id: 'security-config', description: 'Security misconfiguration' },
        { id: 'security-crypto', description: 'Cryptography issues' },
        { id: 'security-secrets', description: 'Exposed secrets' },
      ];
  }
}

/**
 * Map file extension to language identifier
 */
function getLanguageId(extension: string): string {
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    vue: 'vue',
    svelte: 'svelte',
  };
  return map[extension] || extension || 'text';
}
