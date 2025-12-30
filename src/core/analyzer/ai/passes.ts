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

Focus on:
1. **Project Structure** - Is the organization logical? Are there missing directories or patterns?
2. **Dependencies** - Are there concerning dependencies? Version issues? Missing dependencies?
3. **Entry Points** - Are they well-organized? Clear application flow?
4. **Configuration** - Are configs complete? Missing environment handling?
5. **Architecture Patterns** - Consistent patterns? Clear separation of concerns?
6. **Scalability Concerns** - Any obvious bottlenecks or limitations?

Be concise and focus on high-level issues. Don't comment on specific code implementation details - those will be covered in the deep dive pass.

Respond with valid JSON only. No markdown, no explanations outside the JSON.`,

  'deep-dive': `You are an expert senior software engineer conducting a thorough code review.

Focus on:
1. **Bugs and Logic Errors** - Off-by-one, null handling, race conditions, incorrect conditions
2. **Performance Issues** - N+1 queries, memory leaks, unnecessary re-renders, inefficient algorithms
3. **Code Quality** - Complexity, readability, maintainability, code smells
4. **Best Practices** - Framework-specific patterns, TypeScript/Python idioms, error handling
5. **Edge Cases** - Unhandled scenarios, missing validation, boundary conditions

Be specific and actionable. Include line numbers when possible. Don't nitpick style issues unless they significantly affect readability.

Respond with valid JSON only. No markdown, no explanations outside the JSON.`,

  security: `You are a security expert conducting a security-focused code review.

Focus on OWASP Top 10 and common vulnerabilities:
1. **Injection** - SQL, NoSQL, OS command, LDAP injection
2. **Broken Authentication** - Weak passwords, session issues, credential exposure
3. **Sensitive Data Exposure** - Unencrypted data, exposed secrets, logging sensitive info
4. **XXE** - XML external entity attacks
5. **Broken Access Control** - Missing authorization checks, IDOR, privilege escalation
6. **Security Misconfiguration** - Default configs, verbose errors, unnecessary features
7. **XSS** - Stored, reflected, DOM-based cross-site scripting
8. **Insecure Deserialization** - Untrusted data deserialization
9. **Using Components with Known Vulnerabilities** - Outdated dependencies
10. **Insufficient Logging** - Missing audit trails, security event logging

Be thorough but avoid false positives. If you're uncertain, mark severity as 'info' rather than 'error'.

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

  // Add file tree for architecture pass
  if (context.pass === 'architecture') {
    prompt += `## File Tree\n\`\`\`\n`;
    prompt += context.files.map((f) => f.path).join('\n');
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
