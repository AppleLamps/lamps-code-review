/**
 * Framework detection module
 * Analyzes files to detect frameworks, libraries, and languages
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DetectionResult,
  FileInfo,
  Framework,
  FrameworkDetection,
} from '../../types/index.js';

/**
 * Detect frameworks and languages in a codebase
 */
export async function detectFrameworks(
  files: FileInfo[],
  rootPath: string
): Promise<DetectionResult> {
  const detections: FrameworkDetection[] = [];
  const languages = new Set<string>();

  // Analyze file extensions for language detection
  for (const file of files) {
    const lang = extensionToLanguage(file.extension);
    if (lang) {
      languages.add(lang);
    }
  }

  // Try to read package.json for Node.js projects
  const packageJsonPath = path.join(rootPath, 'package.json');
  const packageJson = await tryReadJson(packageJsonPath);

  if (packageJson) {
    const npmDetections = detectFromPackageJson(packageJson);
    detections.push(...npmDetections);
  }

  // Try to read requirements.txt or pyproject.toml for Python projects
  const requirementsPath = path.join(rootPath, 'requirements.txt');
  const pyprojectPath = path.join(rootPath, 'pyproject.toml');

  if (await fileExists(requirementsPath)) {
    const content = await fs.promises.readFile(requirementsPath, 'utf-8');
    const pythonDetections = detectFromRequirements(content);
    detections.push(...pythonDetections);
  }

  if (await fileExists(pyprojectPath)) {
    const content = await fs.promises.readFile(pyprojectPath, 'utf-8');
    const pythonDetections = detectFromPyproject(content);
    detections.push(...pythonDetections);
  }

  // Detect from file patterns
  const patternDetections = detectFromFilePatterns(files);
  detections.push(...patternDetections);

  // Merge duplicate detections and pick highest confidence
  const mergedDetections = mergeDetections(detections);

  // Sort by confidence (descending)
  mergedDetections.sort((a, b) => b.confidence - a.confidence);

  return {
    frameworks: mergedDetections,
    primary: mergedDetections.length > 0 ? mergedDetections[0].framework : null,
    languages: Array.from(languages),
  };
}

/**
 * Detect frameworks from package.json
 */
function detectFromPackageJson(packageJson: PackageJson): FrameworkDetection[] {
  const detections: FrameworkDetection[] = [];
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Next.js detection
  if (deps['next']) {
    detections.push({
      framework: 'nextjs',
      confidence: 0.95,
      evidence: ['next package in dependencies'],
    });
  }

  // React detection
  if (deps['react']) {
    detections.push({
      framework: 'react',
      confidence: deps['next'] ? 0.7 : 0.9, // Lower if Next.js is present
      evidence: ['react package in dependencies'],
    });
  }

  // Express detection
  if (deps['express']) {
    detections.push({
      framework: 'express',
      confidence: 0.9,
      evidence: ['express package in dependencies'],
    });
  }

  // TypeScript detection
  if (deps['typescript'] || packageJson.devDependencies?.['typescript']) {
    detections.push({
      framework: 'typescript',
      confidence: 0.95,
      evidence: ['typescript package in dependencies'],
    });
  }

  // TODO(detector): Add Vue.js detection
  // TODO(detector): Add Svelte detection
  // TODO(detector): Add Angular detection

  return detections;
}

/**
 * Detect Python frameworks from requirements.txt
 */
function detectFromRequirements(content: string): FrameworkDetection[] {
  const detections: FrameworkDetection[] = [];
  const lines = content.toLowerCase().split('\n');

  // FastAPI detection
  if (lines.some((line) => line.startsWith('fastapi'))) {
    detections.push({
      framework: 'fastapi',
      confidence: 0.9,
      evidence: ['fastapi in requirements.txt'],
    });
  }

  // Django detection
  if (lines.some((line) => line.startsWith('django'))) {
    detections.push({
      framework: 'django',
      confidence: 0.9,
      evidence: ['django in requirements.txt'],
    });
  }

  // Python detection (always present if requirements.txt exists)
  detections.push({
    framework: 'python',
    confidence: 0.95,
    evidence: ['requirements.txt exists'],
  });

  return detections;
}

/**
 * Detect Python frameworks from pyproject.toml
 */
function detectFromPyproject(content: string): FrameworkDetection[] {
  const detections: FrameworkDetection[] = [];
  const lowerContent = content.toLowerCase();

  // FastAPI detection
  if (lowerContent.includes('fastapi')) {
    detections.push({
      framework: 'fastapi',
      confidence: 0.9,
      evidence: ['fastapi in pyproject.toml'],
    });
  }

  // Django detection
  if (lowerContent.includes('django')) {
    detections.push({
      framework: 'django',
      confidence: 0.9,
      evidence: ['django in pyproject.toml'],
    });
  }

  // Python detection
  detections.push({
    framework: 'python',
    confidence: 0.95,
    evidence: ['pyproject.toml exists'],
  });

  return detections;
}

/**
 * Detect frameworks from file patterns
 */
function detectFromFilePatterns(files: FileInfo[]): FrameworkDetection[] {
  const detections: FrameworkDetection[] = [];
  const paths = files.map((f) => f.relativePath);

  // Next.js detection via file patterns
  if (
    paths.some((p) => p.startsWith('pages/') || p.startsWith('app/')) &&
    paths.some((p) => p === 'next.config.js' || p === 'next.config.mjs' || p === 'next.config.ts')
  ) {
    detections.push({
      framework: 'nextjs',
      confidence: 0.85,
      evidence: ['Next.js file structure detected (pages/ or app/ with next.config)'],
    });
  }

  // TypeScript detection via tsconfig
  if (paths.some((p) => p === 'tsconfig.json')) {
    detections.push({
      framework: 'typescript',
      confidence: 0.9,
      evidence: ['tsconfig.json found'],
    });
  }

  // JavaScript detection
  const hasJsFiles = files.some((f) =>
    ['.js', '.jsx', '.mjs', '.cjs'].includes(f.extension)
  );
  if (hasJsFiles) {
    detections.push({
      framework: 'javascript',
      confidence: 0.8,
      evidence: ['JavaScript files found'],
    });
  }

  // Python detection
  const hasPyFiles = files.some((f) => f.extension === '.py');
  if (hasPyFiles) {
    detections.push({
      framework: 'python',
      confidence: 0.85,
      evidence: ['Python files found'],
    });
  }

  return detections;
}

/**
 * Merge duplicate framework detections, keeping highest confidence
 */
function mergeDetections(detections: FrameworkDetection[]): FrameworkDetection[] {
  const byFramework = new Map<Framework, FrameworkDetection>();

  for (const detection of detections) {
    const existing = byFramework.get(detection.framework);
    if (!existing || detection.confidence > existing.confidence) {
      byFramework.set(detection.framework, {
        ...detection,
        evidence: existing
          ? [...existing.evidence, ...detection.evidence]
          : detection.evidence,
      });
    } else if (existing) {
      // Merge evidence
      existing.evidence.push(...detection.evidence);
    }
  }

  return Array.from(byFramework.values());
}

/**
 * Map file extension to language name
 */
function extensionToLanguage(ext: string): string | null {
  const map: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.html': 'HTML',
    '.yaml': 'YAML',
    '.yml': 'YAML',
  };
  return map[ext] || null;
}

/**
 * Try to read and parse a JSON file
 */
async function tryReadJson(filePath: string): Promise<PackageJson | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Minimal package.json type */
interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
