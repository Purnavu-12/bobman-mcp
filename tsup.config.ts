import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { server: "src/server.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "node20",
    external: ["better-sqlite3"],
    clean: true,
  },
  {
    entry: { "cli/index": "cli/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "node20",
    external: ["better-sqlite3"],
    banner: { js: "#!/usr/bin/env node" },
  },
]);
