const DEFAULT_MAX_TOKENS = 2000;

function estimateTokens(json: string): number {
  return Math.ceil(Buffer.byteLength(json, "utf8") / 4);
}

function overBudget(value: unknown, maxTokens: number): boolean {
  return estimateTokens(JSON.stringify(value)) > maxTokens;
}

export interface TokenBudgetResult<T> {
  value: T;
  truncated?: {
    file_scope_dropped: number;
    original_count: number;
  };
}

interface FileScopeStatus {
  existing: string[];
  missing: string[];
}

function syncFileScopeStatus(
  status: FileScopeStatus | undefined,
  remaining: Set<string>,
): FileScopeStatus | undefined {
  if (!status) return status;
  return {
    existing: status.existing.filter((p) => remaining.has(p)),
    missing: status.missing.filter((p) => remaining.has(p)),
  };
}

export function enforceTokenBudget<T extends Record<string, unknown>>(
  response: T,
  maxTokens = DEFAULT_MAX_TOKENS,
): TokenBudgetResult<T> {
  const clone = structuredClone(response) as T & {
    file_scope?: string[];
    file_scope_status?: FileScopeStatus;
    truncated?: { file_scope_dropped: number; original_count: number };
  };

  if (!overBudget(clone, maxTokens)) {
    return { value: clone as T };
  }

  if (!Array.isArray(clone.file_scope)) {
    return { value: clone as T };
  }

  const original = [...clone.file_scope];
  const sorted = [...original].sort((a, b) => b.length - a.length);
  clone.file_scope = sorted;
  clone.file_scope_status = syncFileScopeStatus(clone.file_scope_status, new Set(sorted));

  while (clone.file_scope.length > 0 && overBudget(clone, maxTokens)) {
    clone.file_scope.pop();
    clone.file_scope_status = syncFileScopeStatus(
      clone.file_scope_status,
      new Set(clone.file_scope),
    );
  }

  const dropped = original.length - clone.file_scope.length;
  if (dropped > 0) {
    clone.truncated = {
      file_scope_dropped: dropped,
      original_count: original.length,
    };
    while (clone.file_scope.length > 0 && overBudget(clone, maxTokens)) {
      clone.file_scope.pop();
      clone.file_scope_status = syncFileScopeStatus(
        clone.file_scope_status,
        new Set(clone.file_scope),
      );
      clone.truncated.file_scope_dropped = original.length - clone.file_scope.length;
    }
    if (overBudget(clone, maxTokens)) {
      clone.file_scope = [];
      clone.file_scope_status = syncFileScopeStatus(clone.file_scope_status, new Set());
      clone.truncated.file_scope_dropped = original.length;
    }
  }

  return {
    value: clone as T,
    truncated: clone.truncated,
  };
}
