/**
 * Set a real school up on an empty database.
 *
 * The only way to get a usable instance until now was `npm run db:seed`, which
 * is a demonstration: it truncates all 167 tables and then invents Golden
 * Crest International School and four hundred fictional children. Run
 * `prisma migrate deploy` instead and you get a correct, empty schema with no
 * permissions, no roles and no users, which is to say a school nobody can log
 * in to.
 *
 * This is the missing path. It is the opposite of the seed in the two respects
 * that matter:
 *
 *   It refuses to run if there is already a school in the database. A script
 *   that provisions and a script that wipes must never be one keystroke apart,
 *   and this one cannot destroy anything even if pointed at a live term by
 *   somebody who has had a long day. Recovery from the other mistake is a
 *   restore from backup.
 *
 *   It creates nothing that is not true. A school profile, the permission
 *   catalogue, the shipped roles, one administrator, and — only if asked — an
 *   academic year with its terms. No pupils, no staff, no fee structures, no
 *   sample anything. Demonstration data in a live system is indistinguishable
 *   from real data six months later.
 *
 * Usage:
 *
 *   npx tsx --conditions=react-server scripts/new-school.ts \
 *     --name "St Monica Preparatory School" \
 *     --email head@stmonica.edu.gh \
 *     --admin "Ama Boateng" \
 *     --year 2026/2027
 *
 * The administrator's password is generated and printed once. It is not
 * stored anywhere else and the account must change it at first sign-in.
 */

import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/crypto";
import { PERMISSIONS, ROLE_PRESETS } from "../src/lib/rbac";

const db = new PrismaClient();

const line = "─".repeat(72);

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(title: string, details: string[]): never {
  console.error(`\n${line}\n  ${title}\n${line}\n`);
  for (const detail of details) console.error(`  ${detail}`);
  console.error("");
  process.exit(1);
}

/**
 * A password somebody can read off a screen and type on a phone.
 *
 * No l, I, 1, O or 0: this gets read aloud down a telephone line to a head
 * teacher on their first morning, and every one of those is a support call.
 */
function password(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function main() {
  const name = argument("name");
  const email = argument("email");
  const admin = argument("admin");
  const year = argument("year");

  if (!name || !email || !admin) {
    fail("Not enough to go on", [
      "npx tsx --conditions=react-server scripts/new-school.ts \\",
      '  --name "St Monica Preparatory School" \\',
      "  --email head@stmonica.edu.gh \\",
      '  --admin "Ama Boateng" \\',
      "  --year 2026/2027           (optional: creates the year and three terms)",
      "",
      "--name    the school as it should appear on a letterhead",
      "--email   the first administrator's sign-in address",
      "--admin   their name",
    ]);
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail("That is not an email address", [
      `Given: ${email}`,
      "It is the sign-in address for the first administrator, so it has to work.",
    ]);
  }

  /*
   * The refusal that makes this safe to run.
   *
   * Checked before anything is written and against three tables rather than
   * one: a database with a school, or users, or roles in it is a database
   * somebody is already using, whatever state the others are in.
   */
  const [schools, users, roles] = await Promise.all([
    db.school.count(),
    db.user.count(),
    db.role.count(),
  ]);

  if (schools > 0 || users > 0 || roles > 0) {
    fail("There is already a school here", [
      `${schools} school, ${users} users and ${roles} roles are in this database.`,
      "",
      "This script only sets up an empty one. It will not add a second school:",
      "almost nothing in this system is scoped by school, so two schools in one",
      "database means one roll, one staff list and one ledger between them.",
      "",
      "A second school is a second deployment with its own DATABASE_URL, its own",
      "SESSION_SECRET and its own file storage. See the README.",
      "",
      "If this really is a fresh database and you expected it to be empty, you",
      "are pointed at the wrong DATABASE_URL. Check it before doing anything else.",
    ]);
  }

  console.log(`\n${line}\n  Setting up ${name}\n${line}\n`);

  // --- The permission catalogue and the shipped roles ----------------------

  await db.permission.createMany({
    data: PERMISSIONS.map((permission) => ({
      key: permission.key,
      module: permission.module,
      action: permission.action,
      description: permission.description,
    })),
  });

  const allPermissions = await db.permission.findMany({ select: { id: true, key: true } });
  const byKey = new Map(allPermissions.map((permission) => [permission.key, permission.id]));

  let superAdminRoleId = "";

  for (const preset of ROLE_PRESETS) {
    // Deduplicated for the same reason the seed does it: presets are built by
    // spreading one role into another, so a permission can arrive twice and
    // two rows for one permission is a unique constraint violation.
    const keys = [
      ...new Set(
        preset.permissions === "*"
          ? allPermissions.map((permission) => permission.key)
          : preset.permissions,
      ),
    ];

    const role = await db.role.create({
      data: {
        key: preset.key,
        name: preset.name,
        description: preset.description,
        portal: preset.portal,
        rank: preset.rank,
        isSystem: true,
        permissions: {
          create: keys
            .map((key) => byKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true, key: true },
    });

    if (role.key === "super_admin") superAdminRoleId = role.id;
  }

  console.log(`  ${allPermissions.length} permissions, ${ROLE_PRESETS.length} roles.`);

  if (!superAdminRoleId) {
    fail("No super administrator role", [
      "ROLE_PRESETS has no entry with the key super_admin, so there is no role",
      "to give the first account. Nothing has been rolled back: this database now",
      "has permissions and roles in it and no school, which is not a state to",
      "leave. Fix the preset and start again on a fresh database.",
    ]);
  }

  // --- The school ----------------------------------------------------------

  const school = await db.school.create({
    data: {
      name,
      email,
      // Everything else the school fills in for itself under Settings. A
      // placeholder address on a printed report card is worse than a blank
      // one, because a blank prompts somebody to go and set it.
    },
    select: { id: true, name: true },
  });

  await db.campus.create({
    data: {
      schoolId: school.id,
      name: "Main",
      code: "MAIN",
      isMain: true,
    },
  });

  console.log(`  School profile and a main campus.`);

  // --- The first administrator ---------------------------------------------

  const [first, ...rest] = admin.trim().split(/\s+/);
  const secret = password();

  const user = await db.user.create({
    data: {
      email,
      firstName: first ?? admin,
      lastName: rest.join(" ") || "",
      passwordHash: await hashPassword(secret),
      status: "ACTIVE",
      portal: "STAFF",
      // They did not choose this password: it was generated and printed to a
      // terminal, which is not a place a password should live.
      mustChangePassword: true,
      roles: { create: [{ roleId: superAdminRoleId }] },
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: admin,
      action: "school.provision",
      entity: "School",
      entityId: school.id,
      summary: `${school.name} set up from the command line`,
    },
  });

  console.log(`  Administrator: ${admin}.`);

  // --- The academic year, if asked -----------------------------------------

  if (year) {
    const match = /^(\d{4})\/(\d{4})$/.exec(year);
    if (!match) {
      fail("That is not an academic year", [
        `Given: ${year}`,
        "Write it as 2026/2027. The school is otherwise set up and you can add",
        "the year from Academics, then Academic years.",
      ]);
    }

    const start = Number(match[1]);

    /*
     * September to July, in three terms, which is the Ghanaian school year.
     *
     * Dates a school will correct: they are a starting point so that the term
     * selectors on every screen have something in them, not a claim about when
     * this school opens. Nothing here is marked current except the first term,
     * because a year with no current term makes half the system say "there is
     * no current term" on first sign-in.
     */
    const terms = [
      { name: "Term 1", sequence: 1, from: new Date(start, 8, 8), to: new Date(start, 11, 18) },
      { name: "Term 2", sequence: 2, from: new Date(start + 1, 0, 8), to: new Date(start + 1, 3, 2) },
      { name: "Term 3", sequence: 3, from: new Date(start + 1, 3, 22), to: new Date(start + 1, 6, 24) },
    ];

    await db.academicYear.create({
      data: {
        schoolId: school.id,
        name: year,
        startDate: terms[0]!.from,
        endDate: terms[2]!.to,
        isCurrent: true,
        terms: {
          create: terms.map((term) => ({
            name: term.name,
            sequence: term.sequence,
            startDate: term.from,
            endDate: term.to,
            isCurrent: term.sequence === 1,
          })),
        },
      },
    });

    console.log(`  Academic year ${year}, three terms. Correct the dates in the app.`);
  }

  // --- What to do next -----------------------------------------------------

  console.log(`\n${line}\n  Sign in\n${line}\n`);
  console.log(`  ${email}`);
  console.log(`  ${secret}`);
  console.log("");
  console.log("  Printed once and stored nowhere. The account must change it at");
  console.log("  first sign-in. If it is lost, run this against a fresh database.");
  console.log(`\n${line}\n  Then, in this order\n${line}\n`);
  console.log("  1. Settings, then School profile: address, telephone, crest, letterhead.");
  console.log("     Everything printed comes from here, so it is worth ten minutes.");
  if (!year) console.log("  2. Academics, then Academic years: the year and its terms.");
  console.log(`  ${year ? "2" : "3"}. Academics: class levels, sections and subjects.`);
  console.log(`  ${year ? "3" : "4"}. Staff: the people, then Users to give them accounts.`);
  console.log(`  ${year ? "4" : "5"}. Students, or Students then Import for a spreadsheet.`);
  console.log("");
  console.log("  Do NOT run npm run db:seed against this database. It truncates every");
  console.log("  table and replaces the school with a demonstration one.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("\n  Setting up failed:\n");
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
