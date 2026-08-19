/**
 * Boot-time permission sync.
 *
 * Run from scripts/start.mjs after migrations, before the server binds. It
 * takes a handful of queries against an already-migrated database, and on
 * the common path — nothing new in the catalogue — exactly one.
 *
 * Exits 0 even on failure. A permission that could not be synced is a
 * feature nobody can reach yet; a container that will not start is a school
 * that cannot take a payment. The first is worth logging loudly, not worth
 * refusing to serve over.
 */
import { syncPermissions } from "../src/lib/permission-sync";

async function main() {
  const result = await syncPermissions();

  if (result.firstRun) {
    console.log("  No permissions in the database yet — the seed will create them.");
    return;
  }

  if (result.added.length === 0) {
    console.log("  Permissions are up to date.");
    return;
  }

  console.log(
    `  Added ${result.added.length} new permission${result.added.length === 1 ? "" : "s"}: ` +
      result.added.join(", "),
  );

  const grants = Object.entries(result.granted);
  if (grants.length === 0) {
    console.log("  No system role's preset claims them — grant them at /users/roles.");
    return;
  }

  for (const [roleKey, count] of grants) {
    console.log(`    ${roleKey}: +${count}`);
  }
}

main()
  .catch((error) => {
    console.error("  Permission sync failed — new features may be unreachable.");
    console.error(`  ${(error as Error).message}`);
  })
  .finally(() => {
    process.exit(0);
  });
