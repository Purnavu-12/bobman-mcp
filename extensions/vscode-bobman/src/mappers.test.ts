import { describe, expect, it } from "vitest";
import { parseToolJson, sessionLabel } from "./mappers.js";

describe("mappers", () => {
  it("formats session label", () => {
    const label = sessionLabel({
      session_id: "00000000-0000-4000-8000-000000000099",
      state: "IN_PROGRESS",
      objective: "Refactor auth",
      updated_at: 1,
    });
    expect(label).toContain("IN_PROGRESS");
    expect(label).toContain("Refactor auth");
  });

  it("parses tool JSON", () => {
    const data = parseToolJson<{ sessions: unknown[] }>({
      content: [{ type: "text", text: JSON.stringify({ sessions: [] }) }],
    });
    expect(data.sessions).toEqual([]);
  });

  it("prefers structuredContent when present", () => {
    const data = parseToolJson<{ sessions: unknown[] }>({
      content: [{ type: "text", text: "{}" }],
      structuredContent: { sessions: [{ id: 1 }] },
    });
    expect(data.sessions).toHaveLength(1);
  });

  it("throws on isError with JSON message", () => {
    expect(() =>
      parseToolJson({
        content: [{ type: "text", text: JSON.stringify({ message: "DB locked", code: "LOCKED" }) }],
        isError: true,
      }),
    ).toThrow(/DB locked/);
  });
});
