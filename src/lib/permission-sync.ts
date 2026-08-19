import { db } from "@/lib/db";
import { PERMISSIONS, ROLE_PRESETS } from "@/lib/rbac";

/**
 * Ships newly-added permissions to a school that has already been seeded.
 *
 * The seed creates the Permission and Role rows once, on an empty database,
 * and never touches them again. So every permission added to the catalogue
 * after a school's first deploy existed only in the source: the row was
 * never inserted, the permission picker never listed it, no role ever held
 * it, and the page it guards was unreachable by everyone except the system
 * administrator — who bypasses the table entirely. A feature could be built,
 * tested, merged and deployed, and simply not appear.
 *
 * This closes that gap on every boot. It is deliberately **additive only**.
 *
 * The temptation is to reconcile each system role against its preset, which
 * would be one line shorter and quietly wrong: an administrator can edit a
 * system role's permissions from /users/roles, and a reconciling sync would
 * revert their decision on the next deploy — a change nobody made, appearing
 * from nowhere, in the part of the system where surprises are least welcome.
 *
 * So the rule is: a permission that is NEW to this database is granted to the
 * roles its preset names. A permission that already existed is left exactly
 * as the school has it, whether or not that matches the preset. New
 * capabilities arrive; nothing an administrator has decided is undone.
 */
export type PermissionSyncResult = {
  /** Permission keys inserted for the first time. */
  added: string[];
  /** How many role grants were created, by role key. */
  granted: Record<string, number>;
  /** True when the database had no permissions at all — a fresh seed. */
  firstRun: boolean;
};

export async function syncPermissions(): Promise<PermissionSyncResult> {
  const existing = await db.permission.findMany({ select: { id: true, key: true } });
  const existingKeys = new Set(existing.map((permission) => permission.key));

  const missing = PERMISSIONS.filter((permission) => !existingKeys.has(permission.key));

  // Nothing new in the catalogue: the common case, and it costs one query.
  if (missing.length === 0) {
    return { added: [], granted: {}, firstRun: existing.length === 0 };
  }

  await db.permission.createMany({
    data: missing.map((permission) => ({
      key: permission.key,
      module: permission.module,
      action: permission.action,
      description: permission.description,
    })),
    skipDuplicates: true,
  });

  const newKeys = new Set(missing.map((permission) => permission.key));

  const rows = await db.permission.findMany({
    where: { key: { in: [...newKeys] } },
    select: { id: true, key: true },
  });
  const idByKey = new Map(rows.map((row) => [row.key, row.id]));

  const roles = await db.role.findMany({
    where: { isSystem: true },
    select: { id: true, key: true },
  });
  const presetByKey = new Map(ROLE_PRESETS.map((preset) => [preset.key, preset]));

  const granted: Record<string, number> = {};

  for (const role of roles) {
    const preset = presetByKey.get(role.key);
    if (!preset) continue;

    // super_admin short-circuits in can(), so its rows are decoration. Giving
    // it every new permission anyway keeps the picker honest for anyone who
    // opens the role to read it.
    const wanted =
      preset.permissions === "*"
        ? [...newKeys]
        : preset.permissions.filter((key) => newKeys.has(key));

    if (wanted.length === 0) continue;

    const permissionIds = wanted
      .map((key) => idByKey.get(key))
      .filter((id): id is string => Boolean(id));

    const result = await db.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });

    if (result.count > 0) granted[role.key] = result.count;
  }

  return {
    added: [...newKeys],
    granted,
    firstRun: existing.length === 0,
  };
}
