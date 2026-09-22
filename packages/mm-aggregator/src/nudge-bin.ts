#!/usr/bin/env node
/** CLI entry bundled as `plugin/bin/mm-nudge.mjs` (design.md § mm-nudge.mjs). */
import { runNudge } from "./nudge.js";

function main(): void {
  runNudge(process.cwd());
  process.exit(0);
}

main();
