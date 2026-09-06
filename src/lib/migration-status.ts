/**
 * Whether the database schema matches the code that is running against it.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists
 * ---------------------------------------------------------------------------
 *
 * The health check used to answer this question by counting tables in the
 * public schema and reporting "applied" if the count was above zero. On a
 * deployment carrying nine unapplied migrations it reported:
 *
 *     {"status":"ok","database":"connected","migrations":"applied","tables":156}
 *
 * The database was seventeen tables short of the schema the running code
 * expected, and the check that exists to say so said everything was fine. It
 * had verified "not empty" and reported "up to date", which are not the same
 * claim. Every page belonging to the missing modules would have thrown, and the
 * one instrument an operator has for diagnosing that was pointing at green.
 *
 * That is the failure this codebase keeps meeting: two things written at
 * different times that disagree, where neither errors. The cure is the same as
 * everywhere else — compare the two directly instead of using a proxy for one
 * of them. Prisma records what it has applied in _prisma_migrations, and the
 * image carries the migrations the code was built against in prisma/migrations.
 * Those two lists either match or they do not.
 *
 * ---------------------------------------------------------------------------
 * Being ahead is not a fault
 * ---------------------------------------------------------------------------
 *
 * During a rolling deploy the new container migrates while the old one is still
 * serving. For those seconds the old container sees a database holding
 * migrations its own image has never heard of. That is a healthy deploy in
 * progress, not a broken one, so it is reported and not counted against the
 * status. A database BEHIND the code breaks pages; a database ahead of it
 * usually does not, because these migrations are additive.
 */

/** One row of Prisma's own bookkeeping table. */
export type MigrationRow = {
  name: string;
  /** Prisma stamps finished_at only once the migration has fully applied. */
  finished: boolean;
  rolledBack: boolean;
};

export type MigrationState = "applied" | "pending" | "failed" | "unverified";

export type MigrationStatus = {
  state: MigrationState;
  /** True only when the code can be trusted to run against this database. */
  healthy: boolean;
  applied: number;
  /** On disk, not yet applied. These are the ones that break pages. */
  pending: string[];
  /** Started and never finished, or rolled back. A migration that half ran. */
  failed: string[];
  /** Applied, but absent from this image. A newer deploy migrating alongside. */
  ahead: string[];
  hint?: string;
};

/**
 * Compare what the database has applied against what the image ships.
 *
 * `rows` is null when _prisma_migrations does not exist at all, which is what a
 * database that has never been migrated looks like. `onDisk` is null when the
 * migrations directory cannot be read — a runtime image built without it, say.
 * Neither is treated as agreement: the first is a hard "pending", the second is
 * "unverified", because a check that cannot see one of its two inputs must not
 * report that they match. Reporting "applied" on a missing input is the exact
 * bug this file replaces.
 */
export function migrationStatus(input: {
  onDisk: string[] | null;
  rows: MigrationRow[] | null;
}): MigrationStatus {
  const { onDisk, rows } = input;

  if (rows === null) {
    return {
      state: "pending",
      healthy: false,
      applied: 0,
      pending: onDisk ?? [],
      failed: [],
      ahead: [],
      hint:
        "This database has no migration history at all, so `prisma migrate deploy` has never completed against it. Check the deploy logs, then run `npx prisma migrate deploy`.",
    };
  }

  const failed = rows
    .filter((row) => !row.finished || row.rolledBack)
    .map((row) => row.name)
    .sort();

  const applied = new Set(
    rows.filter((row) => row.finished && !row.rolledBack).map((row) => row.name),
  );

  // A half-applied migration is reported before anything else. Everything after
  // this point assumes the history is trustworthy, and it is not.
  if (failed.length > 0) {
    return {
      state: "failed",
      healthy: false,
      applied: applied.size,
      pending: onDisk ? onDisk.filter((name) => !applied.has(name)) : [],
      failed,
      ahead: [],
      hint: `${failed.length === 1 ? "A migration" : `${failed.length} migrations`} started and did not finish, so the schema is in an unknown state. Resolve with \`npx prisma migrate resolve\` before deploying again. Do not run \`prisma db push\` against it.`,
    };
  }

  if (onDisk === null) {
    return {
      state: "unverified",
      healthy: true,
      applied: applied.size,
      pending: [],
      failed: [],
      ahead: [],
      hint:
        "prisma/migrations is not readable from the running image, so the applied history cannot be compared against the code. The count below is what the database reports, unchecked.",
    };
  }

  const pending = onDisk.filter((name) => !applied.has(name));
  const shipped = new Set(onDisk);
  const ahead = [...applied].filter((name) => !shipped.has(name)).sort();

  if (pending.length > 0) {
    return {
      state: "pending",
      healthy: false,
      applied: applied.size,
      pending,
      failed: [],
      ahead,
      hint: `${pending.length === 1 ? "One migration has" : `${pending.length} migrations have`} not been applied, so pages belonging to the affected modules will fail. Run \`npx prisma migrate deploy\`, or redeploy so the start script runs it.`,
    };
  }

  return {
    state: "applied",
    healthy: true,
    applied: applied.size,
    pending: [],
    failed: [],
    ahead,
    // A database ahead of this image is a deploy in flight, not a fault, so it
    // is described rather than warned about.
    ...(ahead.length > 0
      ? {
          hint: `The database has ${ahead.length} migration${ahead.length === 1 ? "" : "s"} this build does not ship, which is what a newer deployment migrating alongside this one looks like.`,
        }
      : {}),
  };
}
