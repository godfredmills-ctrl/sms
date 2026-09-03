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

import { randomBytes, createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { createConnection } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";

const PORT = Number(process.env.DEV_DB_PORT ?? 5432);
const DATA = ".pgdata";

/**
 * Refuse to start if something already has the port, BEFORE touching the data.
 *
 * Checked first because the order matters. Left to fail on listen, this had
 * already opened the data directory and, with `--session`, written to it: two
 * processes with the same PGlite files open, one of them about to die. That is
 * how a data directory gets corrupted, and it is easy to do by accident when a
 * previous run is still up in another window.
 */
const taken = await new Promise((resolve) => {
  const socket = createConnection({ host: "127.0.0.1", port: PORT });
  socket.setTimeout(1500);
  socket.on("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.on("timeout", () => {
    socket.destroy();
    resolve(false);
  });
  socket.on("error", () => resolve(false));
});

if (taken) {
  console.error(
    `\n  Something is already serving on port ${PORT}.\n\n` +
      "  Not starting: two processes with the same PGlite data directory open\n" +
      "  is how it gets corrupted. Stop the other one first.\n",
  );
  process.exit(1);
}

if (process.argv.includes("--fresh")) {
  rmSync(DATA, { recursive: true, force: true });
  console.log(`  Cleared ${DATA}`);
}

const db = await PGlite.create({ dataDir: DATA });
await db.waitReady;

/*
 * A signed-in session, minted here rather than by a separate script.
 *
 * PGlite takes one connection at a time and its wire server does not survive a
 * client disconnecting: a second process that connects, mints a token and
 * leaves it leaves the server answering every subsequent query with "server
 * has closed the connection", which reads exactly like the database being
 * broken. Doing it against the instance directly, before anything has dialled
 * the port, means there is only ever one client.
 *
 *   node scripts/dev-db.mjs --session
 */
if (process.argv.includes("--session")) {
  const at = process.argv.indexOf("--session");
  const email =
    process.argv[at + 1] && !process.argv[at + 1].startsWith("--")
      ? process.argv[at + 1]
      : (process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu.gh");

  const found = await db.query('SELECT id FROM "User" WHERE email = $1 LIMIT 1', [email]);
  const user = found.rows[0];

  if (!user) {
    console.log(`\n  No user with the address ${email}. Has the seed been run?\n`);
  } else {
    const token = randomBytes(32).toString("hex");
    // Prisma generates the id; at this level it has to be supplied, and the
    // shape only has to be unique rather than a real cuid.
    const id = "dev" + randomBytes(12).toString("hex");

    await db.query(
      `INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt", "userAgent", "lastActiveAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        id,
        user.id,
        // The raw token is never stored: the column holds its hash.
        createHash("sha256").update(token).digest("hex"),
        new Date(Date.now() + 7 * 86_400_000),
        "development harness",
      ],
    );

    console.log(`\n  Signed in as ${email} for seven days.`);
    console.log(`  ${token}`);
  }
}

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
