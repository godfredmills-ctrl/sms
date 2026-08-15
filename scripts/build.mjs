/**
 * Production build entrypoint.
 *
 * Normalises NODE_ENV before Next reads it, then runs `prisma generate` and
 * `next build`. Running these as child processes is what makes the fix work:
 * the corrected NODE_ENV is inherited by the compiler rather than being
 * applied too late to matter.
 */

import { spawnSync } from "node:child_process";

import { binOf, normaliseNodeEnv } from "./env.mjs";

normaliseNodeEnv({ fallback: "production" });

function run(label, bin, args) {
  console.log(`\n  ${label}\n`);
  const result = spawnSync(process.execPath, [bin, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\n  ${label} failed (exit code ${result.status}).\n`);
    process.exit(result.status ?? 1);
  }
}

run("Generating Prisma client", await binOf("prisma/build/index.js"), ["generate"]);
run("Building Next.js application", await binOf("next/dist/bin/next"), ["build"]);
