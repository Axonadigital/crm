import path from "node:path";
import { defineConfig } from "vitest/config";

// Workflow baseline tests for the quote pipeline refactor (Phase 0).
// These tests exercise extractable shared helpers directly and assert
// behavioral parity via file snapshots. They must remain green across
// phases 1 and 2 of the quote workflow refactor.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/workflow/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: {
      // Edge functions use Deno JSR imports; alias to installed npm equivalents
      "jsr:@supabase/supabase-js@2": path.resolve(
        __dirname,
        "node_modules/@supabase/supabase-js",
      ),
    },
  },
});
