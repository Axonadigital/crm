#!/usr/bin/env node
/**
 * Verifies that every `[data-tour="…"]` selector the guided tours target still
 * exists somewhere in the app.
 *
 * driver.js runs with `skipMissingElement: true`, so a step pointing at a
 * renamed anchor fails silently — the tour just gets shorter, with nothing in
 * the console and nothing in review to notice. This check makes that loud.
 *
 * Anchors are matched as string literals rather than as `data-tour="x"` only,
 * because several are set conditionally (`data-tour={i === 0 ? "x" : undefined}`).
 * Deleting or renaming the anchor still removes the literal, which is what we
 * are guarding against.
 *
 * Run: node ./scripts/check-tour-anchors.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const TOUR_FILES = [
  "src/components/atomic-crm/tour/tours.desktop.ts",
  "src/components/atomic-crm/tour/tours.mobile.ts",
];
const NAV_FILE = "src/components/atomic-crm/layout/navSections.ts";

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) yield full;
  }
}

const componentFiles = [...walk(SRC)].filter(
  (file) => !TOUR_FILES.includes(file.replaceAll("\\", "/")),
);

/** Every double-quoted string literal in the app, minus the tour definitions. */
const literals = new Set();
for (const file of componentFiles) {
  for (const [, value] of readFileSync(file, "utf8").matchAll(/"([^"\n]+)"/g)) {
    literals.add(value);
  }
}

/** Sidebar nav anchors are derived from the route, never written out. */
const navSource = readFileSync(NAV_FILE, "utf8");
for (const [, to] of navSource.matchAll(/to: "([^"]+)"/g)) {
  literals.add(
    to === "/"
      ? "nav-dashboard"
      : `nav-${to.replace(/^\//, "").replace(/_/g, "-")}`,
  );
}

const missing = [];
const used = new Set();
for (const file of TOUR_FILES) {
  const source = readFileSync(file, "utf8");
  for (const [, anchor] of source.matchAll(/\[data-tour="([^"]+)"\]/g)) {
    used.add(anchor);
    if (!literals.has(anchor)) missing.push({ file, anchor });
  }
}

if (missing.length > 0) {
  console.error("Guidade rundturer pekar på ankare som inte finns i appen:\n");
  for (const { file, anchor } of missing) {
    console.error(`  data-tour="${anchor}"  (används i ${file})`);
  }
  console.error(
    "\nLägg tillbaka ankaret i komponenten, eller ta bort steget ur turen.",
  );
  process.exit(1);
}

console.log(`Tour-ankare OK — ${used.size} ankare, alla hittade.`);
