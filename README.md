# LampsCodeReview

> AI-powered code review SDK and CLI for modern web codebases

[![GitHub](https://img.shields.io/badge/GitHub-AppleLamps-black?logo=github)](https://github.com/AppleLamps)
[![X (Twitter)](https://img.shields.io/badge/X-@lamps__apple-black?logo=x)](https://x.com/lamps_apple)

LampsCodeReview analyzes your codebase using AI to identify security vulnerabilities, performance issues, bugs, and code quality problems. It supports Next.js, React, TypeScript, JavaScript, and Python projects.

## Features

- **AI-Powered Analysis** - Uses OpenRouter to access Claude, GPT-4, Gemini, and other models
- **Full Codebase Context** - Sends entire codebase to AI for holistic understanding of file interactions
- **Framework Detection** - Automatically detects Next.js, React, Express, FastAPI, Django, and more
- **Configurable Models** - Easily switch between AI models via config file or CLI flag
- **Multiple Output Formats** - JSON, Markdown, and HTML reports
- **Dual Interface** - Use as CLI tool or import as SDK
- **Extensible** - Add custom analyzers for project-specific rules

## Quick Start

```bash
# Install
npm install lamps-code-review

# Set API key
export OPENROUTER_API_KEY=your-key-here

# Run review
lamps-review ./my-project
```

## Installation

```bash
npm install lamps-code-review
```

Or install globally:

```bash
npm install -g lamps-code-review
```

## Setup

Get an API key from [OpenRouter](https://openrouter.ai/) and set it as an environment variable:

```bash
# Linux/macOS
export OPENROUTER_API_KEY=your-api-key-here

# Windows (PowerShell)
$env:OPENROUTER_API_KEY="your-api-key-here"

# Windows (CMD)
set OPENROUTER_API_KEY=your-api-key-here
```

## CLI Usage

```bash
# Review current directory
lamps-review

# Review a specific path
lamps-review ./my-project

# Use a different AI model
lamps-review ./my-project --model openai/gpt-4o

# Save report to file
lamps-review ./my-project --output report.json

# Markdown report
lamps-review ./my-project --format markdown --output report.md

# Verbose mode (shows progress)
lamps-review ./my-project --verbose
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write report to file |
| `-f, --format <format>` | Output format: `json`, `markdown`, `html` |
| `-m, --model <model>` | Override AI model (e.g., `openai/gpt-4o`) |
| `-v, --verbose` | Enable verbose output |
| `-c, --config <file>` | Path to config file |

### Example Output

```
🔍 LampsCodeReview - Analyzing: ./my-project

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Review Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 Health Score: 85/100
📁 Files Analyzed: 24

🔧 Frameworks Detected:
   • typescript (95%)
   • react (90%)
   • nextjs (85%)

📋 Findings:
   ⚠️  Warnings: 3
   ℹ️  Info: 5

⏱️  Completed in 18543ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Configuration

Create a `lamps.config.json` in your project root:

```json
{
  "ai": {
    "model": "anthropic/claude-sonnet-4",
    "customPrompt": "Focus on security and performance issues",
    "maxTokens": 4096,
    "temperature": 0.3
  },
  "scan": {
    "ignorePatterns": ["*.test.ts", "*.spec.ts", "**/__mocks__/**"],
    "maxFileSize": 102400,
    "includeExtensions": [".ts", ".tsx", ".js", ".jsx", ".py"]
  },
  "format": "json"
}
```

### Configuration Reference

#### AI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `anthropic/claude-sonnet-4` | OpenRouter model ID |
| `customPrompt` | string | - | Additional instructions for the AI reviewer |
| `maxTokens` | number | `4096` | Maximum tokens in AI response |
| `temperature` | number | `0.3` | AI temperature (0-1, lower = more focused) |

#### Scan Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignorePatterns` | string[] | `[]` | Glob patterns to ignore |
| `maxFileSize` | number | `1048576` | Max file size in bytes (default 1MB) |
| `includeExtensions` | string[] | - | Only include these extensions |
| `useGitignore` | boolean | `true` | Respect .gitignore files |

### Available Models

Any model on [OpenRouter](https://openrouter.ai/models) works, including:

| Model | ID | Best For |
|-------|-----|----------|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | Balanced quality/speed (default) |
| Claude Opus 4 | `anthropic/claude-opus-4` | Highest quality |
| GPT-4o | `openai/gpt-4o` | Fast, good quality |
| Gemini 2.0 Flash | `google/gemini-2.0-flash-thinking-exp-1219` | Very fast |
| Llama 3.1 405B | `meta-llama/llama-3.1-405b-instruct` | Open source |

## SDK Usage

```typescript
import { LampsCodeReview } from 'lamps-code-review';

// Basic usage
const reviewer = new LampsCodeReview();
const report = await reviewer.review('./my-project');

console.log(`Health Score: ${report.summary.healthScore}/100`);
console.log(`Findings: ${report.summary.totalFindings}`);

// With configuration
const reviewer = new LampsCodeReview({
  verbose: true,
  ai: {
    model: 'openai/gpt-4o',
    customPrompt: 'Focus on security vulnerabilities',
  },
  scan: {
    ignorePatterns: ['*.test.ts'],
    maxFileSize: 500 * 1024,
  },
});

const report = await reviewer.review('./my-project');

// Format report
const json = reviewer.formatReport(report, 'json');
const markdown = reviewer.formatReport(report, 'markdown');
```

### Custom Analyzers

Add your own analysis rules:

```typescript
import { LampsCodeReview, BaseAnalyzer } from 'lamps-code-review';
import type { AnalysisContext, AnalysisResult } from 'lamps-code-review';

class MyCustomAnalyzer extends BaseAnalyzer {
  readonly name = 'my-analyzer';
  readonly phase = 'static'; // 'static' | 'ai' | 'post'
  readonly description = 'My custom analysis rules';

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const findings = [];

    // Your analysis logic here
    for (const file of context.files) {
      if (file.relativePath.includes('TODO')) {
        findings.push({
          ruleId: 'my-analyzer/todo-file',
          severity: 'warning',
          file: file.relativePath,
          message: 'File contains TODO in name',
        });
      }
    }

    return this.createResult(findings, startTime);
  }
}

const reviewer = new LampsCodeReview();
reviewer.registerAnalyzer(new MyCustomAnalyzer());
```

## What Gets Analyzed

The AI reviewer checks for:

- **Security** - SQL injection, XSS, command injection, auth issues, secrets exposure
- **Bugs** - Logic errors, null handling, race conditions, off-by-one errors
- **Performance** - N+1 queries, memory leaks, unnecessary re-renders, inefficient algorithms
- **Code Quality** - Complexity, readability, maintainability, code smells
- **Best Practices** - Framework patterns, TypeScript/Python idioms, error handling
- **Architecture** - Coupling, cohesion, separation of concerns

## Report Structure

```typescript
interface ReviewReport {
  version: string;
  timestamp: string;
  repository: {
    path: string;
    filesAnalyzed: number;
  };
  frameworks: {
    frameworks: FrameworkDetection[];
    primary: Framework | null;
    languages: string[];
  };
  summary: {
    totalFindings: number;
    bySeverity: Record<Severity, number>;
    byAnalyzer: Record<string, number>;
    healthScore: number; // 0-100
  };
  findings: Finding[];
  analyzerResults: AnalysisResult[];
}

interface Finding {
  ruleId: string;      // e.g., 'ai/security-sql-injection'
  severity: 'error' | 'warning' | 'info' | 'hint';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}
```

## Development

```bash
# Clone the repo
git clone https://github.com/AppleLamps/lamps-code-review.git
cd lamps-code-review

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run lint

# Run locally
node bin/lamps-review.js ./path/to/project
```

## Architecture

```
src/
├── index.ts              # SDK entry point
├── cli/                  # CLI implementation
│   ├── index.ts          # Command parsing
│   └── commands/
│       └── review.ts     # Review command
├── core/
│   ├── config/           # Configuration loading
│   ├── scanner/          # Repository scanning
│   ├── detector/         # Framework detection
│   ├── analyzer/
│   │   ├── static/       # Static analysis rules
│   │   └── ai/           # AI-powered analysis
│   │       ├── openrouter.ts  # OpenRouter client
│   │       └── prompts.ts     # Review prompts
│   └── reporter/         # Report generation
├── types/                # TypeScript types
└── utils/                # Common utilities
```

## Troubleshooting

### "OPENROUTER_API_KEY not set"

Make sure you've exported the environment variable in your current shell session.

### AI analysis is slow

- Large codebases take longer (all files are sent for context)
- Try a faster model: `--model google/gemini-2.0-flash-thinking-exp-1219`
- Use `--verbose` to see progress

### Files are being skipped

Check your `.gitignore` and `lamps.config.json` ignore patterns. Use `--verbose` to see which files are scanned.

## Author

**Lamps** - [@lamps_apple](https://x.com/lamps_apple)

- GitHub: [AppleLamps](https://github.com/AppleLamps)
- X: [@lamps_apple](https://x.com/lamps_apple)

## License

MIT
