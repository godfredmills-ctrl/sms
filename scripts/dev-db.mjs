/**
 * A throwaway Postgres, for verifying the application on a machine that has
 * none.
 *
 * PGlite is Postgres compiled to WebAssembly. `pglite-server` puts it behind
 * the real Postgres wire protocol on a TCP port, which means Prisma, the
 * migrations, the seed and the application all connect to it exactly as they
 * would to a real server. Nothing in src/ knows this exists, and nothing in
 * src/ had to change for it, which is the whole point: a verification harness
 * that requires production code to be aware of it verifies the wrong thing.
 *
 * It is for development only. The data lives in .pgdata and can be deleted at
 * any time.
 *
 *   node scripts/dev-db.mjs            starts it on 5432
 *   node scripts/dev-db.mjs --fresh    deletes the data first
 */

import { rmSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";

const PORT = Number(process.env.DEV_DB_PORT ?? 5432);
const DATA = ".pgdata";

if (process.argv.includes("--fresh")) {
  rmSync(DATA, { recursive: true, force: true });
  console.log(`  Cleared ${DATA}`);
}

const db = await PGlite.create({ dataDir: DATA });
await db.waitReady;

// Prisma connects as `postgres` and expects the database to exist. PGlite
// serves a single database, so the name in the URL is ignored; this exists so
// a connection naming `sms` does not look like a mistake to whoever reads it.
const server = createServer(db, { logLevel: 1 });

server.listen(PORT, () => {
  console.log(`\n  Postgres (PGlite) listening on 127.0.0.1:${PORT}`);
  console.log(`  Data in ${DATA}. Delete it, or pass --fresh, to start over.\n`);
});

const stop = async () => {
  server.close();
  await db.close();
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
