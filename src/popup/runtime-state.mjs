const DISCONNECTED_RUNTIME_PATTERNS = [
  /could not establish connection/i,
  /message channel closed/i,
  /message port closed/i,
  /receiving end does not exist/i
];

const DATABASE_COMPATIBILITY_PATTERNS = [
  /requested version \(\d+\) is less than the existing version \(\d+\)/i,
  /database upgrade is blocked/i,
  /\bVersionError\b/i
];

export function isMissingRuntimeResponse(response) {
  return response === undefined || response === null;
}

export function isRuntimeDisconnectedError(error) {
  const message = String(error?.message || error || '');
  return DISCONNECTED_RUNTIME_PATTERNS.some(pattern => pattern.test(message));
}

export function isDatabaseCompatibilityError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  return name === 'VersionError'
    || DATABASE_COMPATIBILITY_PATTERNS.some(pattern => pattern.test(message));
}
