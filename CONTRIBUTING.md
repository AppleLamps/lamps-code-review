# Contributing to LampsCodeReview

Thanks for your interest in contributing! This document outlines how to get started.

## Getting Started

1. **Fork the repository**

   Click the "Fork" button on [GitHub](https://github.com/AppleLamps/lamps-code-review)

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR-USERNAME/lamps-code-review.git
   cd lamps-code-review
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

### Build

```bash
npm run build
```

### Run locally

```bash
node bin/lamps-review.js ./path/to/project
```

### Type checking

```bash
npm run lint
```

### Run tests

```bash
npm test
```

## Project Structure

```
src/
├── index.ts              # SDK entry point
├── cli/                  # CLI implementation
├── core/
│   ├── config/           # Configuration loading
│   ├── scanner/          # Repository scanning
│   ├── detector/         # Framework detection
│   ├── analyzer/
│   │   ├── static/       # Static analysis rules
│   │   └── ai/           # AI-powered analysis
│   └── reporter/         # Report generation
├── types/                # TypeScript types
└── utils/                # Common utilities
```

## Making Changes

### Code Style

- Use TypeScript strict mode
- No `any` types unless absolutely necessary
- Use explicit function return types
- Keep functions small and focused
- Add JSDoc comments for public APIs

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add support for Vue.js detection
fix: handle empty files in scanner
docs: update CLI usage examples
refactor: simplify analyzer pipeline
```

Prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Submitting a Pull Request

1. **Push your changes**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your fork and branch

3. **Describe your changes**
   - What does this PR do?
   - Why is this change needed?
   - Any breaking changes?

4. **Wait for review**
   - Address any feedback
   - Keep the PR focused on one thing

## Adding New Analyzers

To add a new analyzer:

1. Create a new file in `src/core/analyzer/`

2. Extend `BaseAnalyzer`:
   ```typescript
   import { BaseAnalyzer } from './types.js';
   import type { AnalysisContext, AnalysisResult } from '../../types/index.js';

   export class MyAnalyzer extends BaseAnalyzer {
     readonly name = 'my-analyzer';
     readonly phase = 'static'; // or 'ai' or 'post'
     readonly description = 'Description of what this analyzes';

     async analyze(context: AnalysisContext): Promise<AnalysisResult> {
       const startTime = Date.now();
       const findings = [];

       // Your analysis logic here

       return this.createResult(findings, startTime);
     }
   }
   ```

3. Register it in `src/core/analyzer/index.ts`

## Adding Framework Detection

To add detection for a new framework:

1. Edit `src/core/detector/index.ts`

2. Add detection logic in `detectFromPackageJson()` or `detectFromFilePatterns()`

3. Add the framework type to `src/types/index.ts`

## Reporting Bugs

Open an issue with:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (Node version, OS)

## Feature Requests

Open an issue with:
- Description of the feature
- Why it would be useful
- Possible implementation approach

## Questions?

- Open an issue on [GitHub](https://github.com/AppleLamps/lamps-code-review/issues)
- Reach out on X: [@lamps_apple](https://x.com/lamps_apple)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
