import { describe, expect, it } from "vitest";
import { isLegalTransition, LEGAL_TRANSITIONS } from "../../src/state/session.js";
import type { SessionState } from "../../src/schemas/persistence.js";

const ALL_STATES: SessionState[] = [
  "INIT",
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
  it("enumerates 81 state pairs", () => {
    expect(ALL_STATES.length * ALL_STATES.length).toBe(81);
  });

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

  it("ANALYZING is unreachable in foundation", () => {
    expect(LEGAL_TRANSITIONS.ANALYZING).toEqual([]);
    for (const from of ALL_STATES) {
      expect(isLegalTransition(from, "ANALYZING")).toBe(false);
    }
  });
});
