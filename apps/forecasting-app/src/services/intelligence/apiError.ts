const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/Authorization\s*:\s*Bearer\s+[^\n\r"}]+/gi, "Authorization: Bearer [redacted]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g, "Bearer [redacted]"],
  [/(api[_-]?key|token|secret|password)(\s*[=:]\s*)[^\s,"}]+/gi, "$1$2[redacted]"],
  [/("(?:api[_-]?key|authorization|token|secret|password)"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2"],
  [/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgres://[redacted]"]
];

function sanitizeErrorText(value: string) {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

export function formatIntelligenceRunApiError(error: unknown, phase: string) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeErrorText(rawMessage || "Unknown Intelligence run error.");
  const name = error instanceof Error && error.name ? sanitizeErrorText(error.name) : "Error";

  return {
    error: "Unable to run Intelligence.",
    phase,
    details: [
      `${name}: ${message}`
    ],
    hint: "Check the Intelligence run history, database schema/migrations, selected company name, and provider configuration."
  };
}
