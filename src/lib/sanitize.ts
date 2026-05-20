const SECRET_KEY_PATTERN =
  /^(password|secret|api_key|apikey|token|authorization)$/i;

const STRING_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: "[REDACTED]" },
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED]" },
  { pattern: /ghp_[A-Za-z0-9]{20,}/g, replacement: "[REDACTED]" },
  { pattern: /github_pat_[A-Za-z0-9_]{82}/g, replacement: "[REDACTED]" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "[REDACTED]" },
  { pattern: /xox[abpr]-[A-Za-z0-9-]+/g, replacement: "[REDACTED]" },
];

function sanitizeString(value: string): string {
  let result = value;
  for (const { pattern, replacement } of STRING_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitize(val);
      }
    }
    return out;
  }
  return value;
}
