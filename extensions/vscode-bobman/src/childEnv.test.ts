import { afterEach, describe, expect, it } from "vitest";
import { bobmanChildEnv } from "./childEnv.js";

describe("bobmanChildEnv", () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("includes BOBMAN_HOME when set in parent process", () => {
    prev.BOBMAN_HOME = process.env.BOBMAN_HOME;
    process.env.BOBMAN_HOME = "/tmp/custom-bobman";
    const env = bobmanChildEnv();
    expect(env.BOBMAN_HOME).toBe("/tmp/custom-bobman");
    expect(env.PATH).toBeTruthy();
  });
});
