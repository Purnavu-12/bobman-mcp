import { describe, expect, it } from "vitest";
import { enforceTokenBudget } from "../../src/lib/token-budget.js";

describe("enforceTokenBudget", () => {
  it("truncates large file_scope", () => {
    const file_scope = Array.from(
      { length: 80 },
      (_, i) =>
        `src/very/long/path/to/deeply/nested/module/component/feature-area/subsystem-${i}/index.ts`,
    );
    const { value, truncated } = enforceTokenBudget(
      {
        session_id: "00000000-0000-4000-8000-000000000001",
        task_id: "task-a",
        attempt: 1,
        instruction: "Do work".repeat(50),
        acceptance_criteria: "Done".repeat(50),
        file_scope,
        estimated_complexity: "medium",
        state: "AWAITING_REPORT",
      },
      500,
    );
    const tokens = Math.ceil(Buffer.byteLength(JSON.stringify(value), "utf8") / 4);
    expect(tokens).toBeLessThanOrEqual(500);
    expect(truncated?.file_scope_dropped).toBeGreaterThan(0);
    expect((value as { file_scope: string[] }).file_scope.length).toBeLessThan(80);
  });
});
