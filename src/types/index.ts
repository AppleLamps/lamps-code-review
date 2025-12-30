/**
 * Core type definitions for LampsCodeReview SDK
 */

// ============================================================================
// File & Scanning Types
// ============================================================================

export interface FileInfo {
  /** Absolute path to the file */
  path: string;
  /** Relative path from repository root */
  relativePath: string;
  /** File extension (e.g., '.ts', '.py') */
  extension: string;
  /** File size in bytes */
  size: number;
  /** File content (loaded on demand) */
  content?: string;
}

export interface ScanResult {
  /** List of scanned files */
  files: FileInfo[];
  /** Scan statistics */
  stats: ScanStats;
  /** Root path that was scanned */
  rootPath: string;
}

export interface ScanStats {
  /** Total number of files scanned */
  totalFiles: number;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Number of files skipped due to ignore rules */
  skippedFiles: number;
  /** Breakdown by file extension */
  byExtension: Record<string, number>;
}

export interface ScanConfig {
  /** Additional patterns to ignore (glob format) */
  ignorePatterns?: string[];
  /** Whether to respect .gitignore files */
  useGitignore?: boolean;
  /** Maximum file size to include (in bytes) */
  maxFileSize?: number;
  /** File extensions to include (e.g., ['.ts', '.js']) */
  includeExtensions?: string[];
}

// ============================================================================
// Framework Detection Types
// ============================================================================

export type Framework =
  | 'nextjs'
  | 'react'
  | 'python'
  | 'typescript'
  | 'javascript'
  | 'express'
  | 'fastapi'
  | 'django';

export interface FrameworkDetection {
  /** Detected framework */
  framework: Framework;
  /** Confidence score (0-1) */
  confidence: number;
  /** Evidence that led to this detection */
  evidence: string[];
}

export interface DetectionResult {
  /** All detected frameworks */
  frameworks: FrameworkDetection[];
  /** Primary/main framework (highest confidence) */
  primary: Framework | null;
  /** Programming languages detected */
  languages: string[];
}

// ============================================================================
// Analyzer Types
// ============================================================================

export type AnalyzerPhase = 'static' | 'ai' | 'post';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface Finding {
  /** Unique identifier for this finding type */
  ruleId: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: Severity;
  /** File where the finding was detected */
  file: string;
  /** Line number (1-based) */
  line?: number;
  /** Column number (1-based) */
  column?: number;
  /** Code snippet for context */
  snippet?: string;
  /** Suggested fix (if available) */
  suggestion?: string;
}

export interface AnalysisContext {
  /** Scanned files */
  files: FileInfo[];
  /** Detected frameworks */
  frameworks: DetectionResult;
  /** User configuration */
  config: ReviewConfig;
  /** Repository root path */
  rootPath: string;
  /** Logger for progress output (avoids global state) */
  logger?: {
    log: (message: string) => void;
    phase: (name: string) => void;
    step: (message: string) => void;
    detail: (message: string) => void;
    success: (message: string) => void;
    warn: (message: string) => void;
  };
}

export interface AnalysisResult {
  /** Analyzer that produced this result */
  analyzerName: string;
  /** Phase this analyzer ran in */
  phase: AnalyzerPhase;
  /** Findings from this analyzer */
  findings: Finding[];
  /** Execution time in milliseconds */
  duration: number;
  /** Any metadata from the analyzer */
  metadata?: Record<string, unknown>;
}

export interface Analyzer {
  /** Unique name for this analyzer */
  name: string;
  /** Execution phase */
  phase: AnalyzerPhase;
  /** Human-readable description */
  description: string;
  /** Run the analysis */
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
}

// ============================================================================
// Report Types
// ============================================================================

export type ReportFormat = 'json' | 'markdown' | 'html';

export interface ReviewReport {
  /** Report version for compatibility */
  version: string;
  /** When the review was generated */
  timestamp: string;
  /** Repository that was reviewed */
  repository: {
    path: string;
    filesAnalyzed: number;
  };
  /** Detected frameworks */
  frameworks: DetectionResult;
  /** Summary statistics */
  summary: ReportSummary;
  /** All findings grouped by file */
  findings: Finding[];
  /** Results from each analyzer */
  analyzerResults: AnalysisResult[];
}

export interface ReportSummary {
  /** Total number of findings */
  totalFindings: number;
  /** Findings by severity */
  bySeverity: Record<Severity, number>;
  /** Findings by analyzer */
  byAnalyzer: Record<string, number>;
  /** Overall health score (0-100) */
  healthScore: number;
}

// ============================================================================
// AI Configuration Types
// ============================================================================

export interface AIConfig {
  /** OpenRouter model ID (e.g., 'anthropic/claude-sonnet-4') */
  model: string;
  /** Custom review prompt (overrides default) */
  customPrompt?: string;
  /** Maximum tokens for AI response */
  maxTokens: number;
  /** Temperature for AI response (0-1, lower = more focused) */
  temperature: number;
}

/** Default AI configuration */
export const DEFAULT_AI_CONFIG: AIConfig = {
  model: 'minimax/minimax-m2.1',
  maxTokens: 150000,
  temperature: 0.3,
};

// ============================================================================
// Configuration Types
// ============================================================================

export interface ReviewConfig {
  /** Scanning configuration */
  scan?: ScanConfig;
  /** AI configuration */
  ai?: Partial<AIConfig>;
  /** Output format */
  format?: ReportFormat;
  /** Output file path (if writing to file) */
  output?: string;
  /** Analyzers to enable (by name) */
  enabledAnalyzers?: string[];
  /** Analyzers to disable (by name) */
  disabledAnalyzers?: string[];
  /** Verbose logging */
  verbose?: boolean;
}

/** Full configuration file structure (lamps.config.json) */
export interface LampsConfig extends ReviewConfig {
  /** Config file version */
  version?: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface CLIOptions {
  /** Output file path */
  output?: string;
  /** Output format */
  format?: ReportFormat;
  /** Verbose output */
  verbose?: boolean;
  /** Config file path */
  config?: string;
  /** Override AI model */
  model?: string;
}

// ============================================================================
// Dependency Graph Types
// ============================================================================

export type FileCategory = 'entry' | 'config' | 'component' | 'util' | 'test' | 'api' | 'other';

export interface FileNode {
  /** Relative path to the file */
  path: string;
  /** Files this file imports */
  imports: string[];
  /** Files that import this file */
  importedBy: string[];
  /** Exported symbols (function/class/const names) */
  exports: string[];
  /** File category for prioritization */
  category: FileCategory;
  /** File size in bytes */
  size: number;
  /** Priority score (calculated) */
  priority?: number;
}

export interface DependencyGraph {
  /** All files in the graph */
  files: Map<string, FileNode>;
  /** Entry point files */
  entryPoints: string[];
  /** Configuration files */
  configFiles: string[];
  /** Test files */
  testFiles: string[];
  /** API route files */
  apiFiles: string[];
}

// ============================================================================
// Smart Context Types
// ============================================================================

export type AIPassType = 'architecture' | 'deep-dive' | 'security';

export interface CodeSlice {
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** The actual code content */
  content: string;
  /** Why this slice was included */
  reason: string;
}

export interface ContextFile {
  /** Relative path to the file */
  path: string;
  /** Full file content (if included) */
  content?: string;
  /** Relevant code slices (if not full content) */
  slices?: CodeSlice[];
  /** Why this file was included */
  reason: string;
  /** Priority score */
  priority: number;
}

export interface ReviewContext {
  /** Which AI pass this context is for */
  pass: AIPassType;
  /** Files to include in this pass */
  files: ContextFile[];
  /** Metadata about the context */
  metadata: {
    totalFiles: number;
    totalTokenEstimate: number;
    frameworks: string[];
    focusAreas: string[];
    /** Full file tree (all paths in codebase) - for architecture pass */
    fullFileTree?: string[];
  };
}

export interface AIPassResult {
  /** Which pass produced these findings */
  pass: AIPassType;
  /** Findings from this pass */
  findings: Finding[];
  /** Summary from the AI */
  summary: string;
  /** Token usage */
  tokenUsage?: {
    input: number;
    output: number;
  };
}
