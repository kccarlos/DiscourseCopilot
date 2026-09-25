// Prefixed console logging for the side panel, plus the one sanctioned sink
// for diagnostic traces (the rest of src/ may only call console.warn/error).
export const DiscourseCopilotLogger = {
  error(message, ...args) {
    console.error(`[DiscourseCopilot ERROR] ${message}`, ...args);
  },

  warn(message, ...args) {
    console.warn(`[DiscourseCopilot WARN] ${message}`, ...args);
  },

  // Diagnostic trace, printed as given (callers add their own prefix, e.g. "AI Service:").
  log(message, ...args) {
    // biome-ignore lint/suspicious/noConsole: this is the single place diagnostic traces reach the console.
    console.log(message, ...args);
  }
};
