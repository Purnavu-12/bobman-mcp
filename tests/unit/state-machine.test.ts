import { describe, expect, it } from "vitest";
import { isLegalTransition, LEGAL_TRANSITIONS } from "../../src/state/session.js";
import type { SessionState } from "../../src/schemas/persistence.js";

const ALL_STATES: SessionState[] = [
  "INIT",
  "DECOMPOSING",
  "ANALYZING",
  "PLANNED",
  "IN_PROGRESS",
  "AWAITING_REPORT",
  "EVALUATING",
  "RETRYING",
  "BLOCKED",
  "COMPLETE",
];

describe("session state machine", () => {
  it("RETRYING can reach AWAITING_REPORT", () => {
    expect(isLegalTransition("RETRYING", "AWAITING_REPORT")).toBe(true);
  });

  it("matches legal transition table", () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected = LEGAL_TRANSITIONS[from].includes(to);
        expect(isLegalTransition(from, to)).toBe(expected);
      }
    }
  });

  it("terminal states have no outgoing transitions", () => {
    expect(LEGAL_TRANSITIONS.BLOCKED).toEqual([]);
    expect(LEGAL_TRANSITIONS.COMPLETE).toEqual([]);
  });

  it("INIT can reach DECOMPOSING (Wave 2 add-task-decomposition)", () => {
    expect(isLegalTransition("INIT", "DECOMPOSING")).toBe(true);
    expect(isLegalTransition("DECOMPOSING", "PLANNED")).toBe(true);
  });

  it("ANALYZING is reachable from INIT and PLANNED (Wave 2 add-treesitter-analyzer)", () => {
    expect(isLegalTransition("INIT", "ANALYZING")).toBe(true);
    expect(isLegalTransition("PLANNED", "ANALYZING")).toBe(true);
    expect(isLegalTransition("ANALYZING", "INIT")).toBe(true);
    expect(isLegalTransition("ANALYZING", "PLANNED")).toBe(true);
  });
});
