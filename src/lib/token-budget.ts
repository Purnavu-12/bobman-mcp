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

export function enforceTokenBudget<T extends Record<string, unknown>>(
  response: T,
  maxTokens = DEFAULT_MAX_TOKENS,
): TokenBudgetResult<T> {
  const clone = structuredClone(response) as T & {
    file_scope?: string[];
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

  while (clone.file_scope.length > 0 && overBudget(clone, maxTokens)) {
    clone.file_scope.pop();
  }

  const dropped = original.length - clone.file_scope.length;
  if (dropped > 0) {
    clone.truncated = {
      file_scope_dropped: dropped,
      original_count: original.length,
    };
    while (clone.file_scope.length > 0 && overBudget(clone, maxTokens)) {
      clone.file_scope.pop();
      clone.truncated.file_scope_dropped = original.length - clone.file_scope.length;
    }
    if (overBudget(clone, maxTokens)) {
      clone.file_scope = [];
      clone.truncated.file_scope_dropped = original.length;
    }
  }

  return {
    value: clone as T,
    truncated: clone.truncated,
  };
}
