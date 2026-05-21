import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bobmanChildEnv } from "./childEnv.js";

describe("bobmanChildEnv", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = {};
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    envSnapshot = {};
  });

  it("includes BOBMAN_HOME when set in parent process", () => {
    envSnapshot.BOBMAN_HOME = process.env.BOBMAN_HOME;
    process.env.BOBMAN_HOME = "/tmp/custom-bobman";
    const env = bobmanChildEnv();
    expect(env.BOBMAN_HOME).toBe("/tmp/custom-bobman");
    expect(env.PATH).toBeTruthy();
  });
});
