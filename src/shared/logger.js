// Prefixed console logging for the side panel.
export const DiscourseCopilotLogger = {
  error(message, ...args) {
    console.error(`[DiscourseCopilot ERROR] ${message}`, ...args);
  },

  warn(message, ...args) {
    console.warn(`[DiscourseCopilot WARN] ${message}`, ...args);
  }
};
