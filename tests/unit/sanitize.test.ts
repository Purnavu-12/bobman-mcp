import { describe, expect, it } from "vitest";
import { sanitize } from "../../src/lib/sanitize.js";

describe("sanitize", () => {
  it("redacts Bearer tokens", () => {
    const out = sanitize({ notes: "used Bearer eyJhbGciOi.test" }) as { notes: string };
    expect(out.notes).toBe("used [REDACTED]");
  });

  it("redacts AWS keys", () => {
    const out = sanitize("AKIAIOSFODNN7EXAMPLE");
    expect(out).toBe("[REDACTED]");
  });

  it("redacts GitHub PAT", () => {
    const out = sanitize("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(out).toBe("[REDACTED]");
  });

  it("redacts OpenAI keys", () => {
    const out = sanitize("sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(out).toBe("[REDACTED]");
  });

  it("redacts key-named secrets in objects", () => {
    const out = sanitize({ api_key: "anything", safe: "hello" }) as Record<string, string>;
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.safe).toBe("hello");
  });

  it("walks nested objects and arrays", () => {
    const out = sanitize({
      items: [{ notes: "Bearer abc.def" }],
      meta: { token: "secret-value" },
    }) as {
      items: { notes: string }[];
      meta: { token: string };
    };
    expect(out.items[0].notes).toBe("[REDACTED]");
    expect(out.meta.token).toBe("[REDACTED]");
  });

  it("leaves numbers untouched", () => {
    expect(sanitize(42)).toBe(42);
  });
});
