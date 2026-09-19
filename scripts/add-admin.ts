/**
 * Add an administrator to a school that already exists.
 *
 * new-school.ts makes the first one, and refuses to run a second time because
 * provisioning twice is how a school ends up with two of everything. But a
 * school has more than one administrator, and until now the only way to add
 * the second was to create a user by hand and remember to attach the role.
 *
 *   npm run admin:add -- --name "Brew Nketia" --email brew@school.edu.gh
 *   npm run admin:add -- --name "Kelvin Aboagye" --email kelvin@school.edu.gh --password "Demo1234!"
 *
 * The password is generated and printed once unless one is given. --password
 * is for a demonstration, where three people need to sign in from three
 * laptops and a generated string read aloud across a room is a waste of
 * everybody's morning. It is not for a live school.
 *
 * A staff record is created alongside, unless --no-staff is passed. Without
 * one the account is a login and not a person: it cannot be marked on the
 * attendance register, appraised, put on a timetable or named as the person
 * who approved something, and half the screens in the system quietly leave it
 * out of their lists.
 */

import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/crypto";

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

/** No l, I, 1, O or 0: this gets read aloud and typed on a telephone. */
function generated(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function main() {
  const name = argument("name");
  const email = argument("email")?.toLowerCase();

  if (!name || !email) {
    fail("Who, and at what address?", [
      'npm run admin:add -- --name "Brew Nketia" --email brew@school.edu.gh',
      "",
      "--name      as it should appear on screen and on anything they sign",
      "--email     their sign-in address",
      "--password  optional; generated and printed once if omitted",
      "--no-staff  make a login only, with no staff record behind it",
    ]);
  }

  const school = await db.school.findFirst({ select: { id: true, name: true } });
  if (!school) {
    fail("There is no school on this database", [
      "This adds an administrator to a school that exists. Run school:new first.",
    ]);
  }

  const role = await db.role.findFirst({
    where: { key: "super_admin" },
    select: { id: true },
  });
  if (!role) {
    fail("There is no System Administrator role on this database", [
      "The permission catalogue has not been set up. Run school:new, or",
      "npm run db:sync-permissions against an existing school.",
    ]);
  }

  const clash = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) {
    fail(`${email} already has an account`, [
      "Use a different address, or give the existing account the System",
      "Administrator role under Users and roles.",
    ]);
  }

  const [first, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(" ");
  const chosen = argument("password");
  const secret = chosen ?? generated();

  // A staff record first, so the user can point at it. An administrator with
  // no staff record is a login rather than a person: not on the attendance
  // register, not appraisable, and absent from every list that starts from
  // Staff rather than from User.
  let staffId: string | null = null;
  if (!has("no-staff")) {
    const count = await db.staff.count();
    const staff = await db.staff.create({
      data: {
        staffNo: `ADM/${String(count + 1).padStart(3, "0")}`,
        firstName: first ?? name,
        lastName: lastName || first || name,
        email,
        jobTitle: "System Administrator",
        department: "Administration",
        isTeaching: false,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    staffId = staff.id;
  }

  const user = await db.user.create({
    data: {
      email,
      firstName: first ?? name,
      lastName: lastName || "",
      passwordHash: await hashPassword(secret),
      status: "ACTIVE",
      portal: "STAFF",
      // Only when nobody chose it. A password typed on the command line was
      // chosen by somebody, and forcing a change at the start of a
      // demonstration is a way to lose the first five minutes of it.
      mustChangePassword: chosen === null,
      staff: staffId ? { connect: { id: staffId } } : undefined,
      roles: { create: [{ roleId: role.id }] },
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: name,
      action: "user.create",
      entity: "User",
      entityId: user.id,
      summary: `${name} added as a System Administrator`,
    },
  });

  console.log(`\n${line}\n  ${name} can sign in to ${school!.name}\n${line}\n`);
  console.log(`  ${email}`);
  console.log(`  ${secret}`);
  console.log("");
  if (chosen === null) {
    console.log("  Generated, printed once, stored nowhere. They must change it");
    console.log("  at first sign-in.");
  } else {
    console.log("  As given on the command line. They will not be asked to change it.");
  }
  console.log(
    staffId
      ? "  A staff record was created too, so they appear on the register.\n"
      : "  No staff record: this is a login only.\n",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
