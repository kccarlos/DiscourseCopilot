// Prefixed console logging for the side panel, plus the one sanctioned sink
// for diagnostic traces (the rest of src/ may only call console.warn/error).
// import.meta.env only exists under Vite (undefined under plain Node, where tests run).
const TRACE_ENABLED = Boolean(import.meta.env?.DEV);

export const DiscourseCopilotLogger = {
  error(message, ...args) {
    console.error(`[DiscourseCopilot ERROR] ${message}`, ...args);
  },

  warn(message, ...args) {
    console.warn(`[DiscourseCopilot WARN] ${message}`, ...args);
  },

  // Diagnostic trace, printed as given (callers add their own prefix, e.g. "AI Service:").
  // Development builds only (pnpm dev): production builds set DEV to false, so
  // nothing is printed there.
  log(message, ...args) {
    if (TRACE_ENABLED) {
      // biome-ignore lint/suspicious/noConsole: this is the single place diagnostic traces reach the console.
      console.log(message, ...args);
    }
  }
};
