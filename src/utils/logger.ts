/**
 * Progress Logger
 * Provides detailed progress updates during analysis
 */

export interface ProgressLogger {
  log: (message: string) => void;
  phase: (name: string) => void;
  step: (message: string) => void;
  detail: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
}

/**
 * Create a progress logger
 */
export function createLogger(verbose: boolean): ProgressLogger {
  const timestamp = () => {
    const now = new Date();
    return `[${now.toLocaleTimeString()}]`;
  };

  if (!verbose) {
    // Silent logger when not verbose
    return {
      log: () => {},
      phase: () => {},
      step: () => {},
      detail: () => {},
      success: () => {},
      warn: () => {},
    };
  }

  return {
    log: (message: string) => {
      console.log(`${timestamp()} ${message}`);
    },
    phase: (name: string) => {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`📌 ${name}`);
      console.log(`${'─'.repeat(50)}`);
    },
    step: (message: string) => {
      console.log(`   → ${message}`);
    },
    detail: (message: string) => {
      console.log(`     • ${message}`);
    },
    success: (message: string) => {
      console.log(`   ✓ ${message}`);
    },
    warn: (message: string) => {
      console.log(`   ⚠ ${message}`);
    },
  };
}

/**
 * Global logger instance (set during analysis)
 */
let globalLogger: ProgressLogger | null = null;

export function setGlobalLogger(logger: ProgressLogger): void {
  globalLogger = logger;
}

export function getGlobalLogger(): ProgressLogger {
  return globalLogger || createLogger(false);
}
