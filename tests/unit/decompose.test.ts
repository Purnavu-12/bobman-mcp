import { describe, expect, it } from "vitest";
import { decomposeObjective } from "../../src/lib/decompose.js";

describe("decomposeObjective", () => {
  it("splits a numbered list into a linear chain", () => {
    const g = decomposeObjective("1. Add tests. 2. Fix bug. 3. Update docs.");
    expect(g.tasks).toHaveLength(3);
    expect(g.tasks.map((t) => t.task_id)).toEqual(["step-1", "step-2", "step-3"]);
    expect(g.edges).toEqual([
      { from: "step-1", to: "step-2" },
      { from: "step-2", to: "step-3" },
    ]);
  });

  it("splits a bulleted list", () => {
    const g = decomposeObjective("- Add tests\n- Fix bug\n- Update docs");
    expect(g.tasks).toHaveLength(3);
    expect(g.tasks[0].instruction).toBe("Add tests");
    expect(g.edges).toHaveLength(2);
  });

  it("splits on conjunctions", () => {
    const g = decomposeObjective(
      "Implement auth then add tests after that update docs",
    );
    expect(g.tasks).toHaveLength(3);
  });

  it("falls back to a single task for one-clause input", () => {
    const g = decomposeObjective("Refactor the auth module");
    expect(g.tasks).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
    expect(g.tasks[0].task_id).toBe("step-1");
  });

  it("returns empty for whitespace-only input", () => {
    const g = decomposeObjective("   \n  ");
    expect(g.tasks).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("infers file_scope from backticked paths", () => {
    const g = decomposeObjective("Update `src/auth.ts` and `docs/README.md`");
    expect(g.tasks).toHaveLength(1);
    expect(g.tasks[0].file_scope).toEqual(
      expect.arrayContaining(["src/auth.ts", "docs/README.md"]),
    );
  });

  it("infers file_scope from bare filenames", () => {
    const g = decomposeObjective("Edit foo.ts to add a new function");
    expect(g.tasks[0].file_scope).toEqual(expect.arrayContaining(["foo.ts"]));
  });

  it("is deterministic for the same input", () => {
    const a = decomposeObjective("1. A 2. B 3. C");
    const b = decomposeObjective("1. A 2. B 3. C");
    expect(a).toEqual(b);
  });
});
