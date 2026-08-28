"use server";

import { revalidatePath } from "next/cache";

import { authorize, userCan } from "@/lib/auth";
import {
  ALLERGEN_KEYS,
  SITTING_VALUES,
  allergyWarnings,
  cycleWeekFor,
  entitlement,
  isoDay,
  needsOverride,
  sittingLabel,
  type RecordedAllergy,
  type Warning,
} from "@/lib/cafeteria-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export type CafeteriaState = {
  ok?: boolean;
  error?: string;
  message?: string;
  serviceId?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function money(formData: FormData, key: string): number {
  const raw = text(formData, key);
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return -1;
  // Cedis in, pesewas stored. Rounded rather than truncated: 15.005 entered
  // by a spreadsheet paste should not quietly lose half a pesewa.
  return Math.round(value * 100);
}

/** Local midnight, which is the date a service is filed under. */
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateOnly(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function savePlanAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.plan.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const name = text(formData, "name");
  const code = text(formData, "code").toUpperCase().replace(/\s+/g, "_");
  if (!name) return { error: "Give the plan a name." };
  if (!code) return { error: "Give the plan a short code." };

  const sittings = formData.getAll("sittings").map(String).filter(Boolean);
  if (!sittings.length) {
    return {
      error:
        "Choose at least one sitting. A plan that covers nothing would sell, bill, and then turn the child away at every counter.",
    };
  }
  if (sittings.some((sitting) => !SITTING_VALUES.includes(sitting as never))) {
    return { error: "That is not one of the sittings." };
  }

  const priceMinor = money(formData, "price");
  const perMealMinor = money(formData, "perMeal");
  if (priceMinor < 0 || perMealMinor < 0) {
    return { error: "Prices cannot be negative." };
  }

  const data = {
    code,
    name,
    description: optional(formData, "description"),
    sittings: sittings as never,
    priceMinor,
    perMealMinor,
    isActive: formData.get("isActive") === "on",
  };

  try {
    if (id) {
      await db.mealPlan.update({ where: { id }, data });
    } else {
      await db.mealPlan.create({ data });
    }
  } catch (error) {
    if (String((error as Error).message).includes("MealPlan_code_key")) {
      return { error: `There is already a plan with the code ${code}.` };
    }
    throw error;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "cafeteria.plan.update" : "cafeteria.plan.create",
      entity: "MealPlan",
      entityId: id || code,
      summary: `${name} at ${formatMoney(priceMinor)} a term`,
    },
  });

  revalidatePath("/cafeteria/plans");
  revalidatePath("/cafeteria/subscriptions");
  return { ok: true, message: id ? "Plan updated." : "Plan created." };
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function subscribeAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.subscribe");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  const planId = text(formData, "planId");
  const termId = text(formData, "termId");
  if (!studentId) return { error: "Choose the pupil." };
  if (!planId) return { error: "Choose a plan." };
  if (!termId) return { error: "Choose the term." };

  const term = await db.term.findUnique({
    where: { id: termId },
    select: { startDate: true, endDate: true, name: true },
  });
  if (!term) return { error: "Term not found." };

  const startsOn = dateOnly(text(formData, "startsOn")) ?? term.startDate;
  const endsOn = dateOnly(text(formData, "endsOn"));
  if (endsOn && endsOn < startsOn) {
    return { error: "The end date is before the start date." };
  }

  const [student, plan] = await Promise.all([
    db.student.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } }),
    db.mealPlan.findUnique({ where: { id: planId }, select: { name: true, isActive: true } }),
  ]);
  if (!student) return { error: "Student not found." };
  if (!plan) return { error: "Plan not found." };
  if (!plan.isActive) return { error: `${plan.name} is not on sale.` };

  // Moving a pupil onto a different plan mid-term ends the old row rather than
  // editing it: the first three weeks were billed on the old plan, and
  // overwriting it would make the invoice unexplainable. The partial unique
  // index in the migration refuses two live rows, so this has to happen first.
  const live = await db.mealSubscription.findFirst({
    where: { studentId, termId, status: "ACTIVE" },
    select: { id: true, planId: true },
  });

  if (live?.planId === planId) {
    return { error: `They are already on ${plan.name} this term.` };
  }

  await db.$transaction(async (tx) => {
    if (live) {
      await tx.mealSubscription.update({
        where: { id: live.id },
        data: {
          status: "ENDED",
          endsOn: new Date(startsOn.getTime() - 86_400_000),
          reason: `Moved to ${plan.name}`,
        },
      });
    }

    await tx.mealSubscription.create({
      data: { studentId, planId, termId, startsOn, endsOn, status: "ACTIVE" },
    });
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "cafeteria.subscribe",
      entity: "Student",
      entityId: studentId,
      summary: `${student.firstName} ${student.lastName} onto ${plan.name} for ${term.name}`,
    },
  });

  revalidatePath("/cafeteria/subscriptions");
  revalidatePath("/cafeteria");
  return { ok: true, message: `${student.firstName} is on ${plan.name}.` };
}

export async function setSubscriptionStatusAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.subscribe");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!id) return { error: "No subscription given." };
  if (!["ACTIVE", "SUSPENDED", "ENDED"].includes(status)) {
    return { error: "That is not one of the statuses." };
  }

  const subscription = await db.mealSubscription.findUnique({
    where: { id },
    select: {
      studentId: true,
      termId: true,
      status: true,
      student: { select: { firstName: true, lastName: true } },
      plan: { select: { name: true } },
    },
  });
  if (!subscription) return { error: "Subscription not found." };

  // Reviving a row when another is already live would break the one-live-plan
  // index, and the error a database constraint gives is not one a caterer can
  // read. Caught here so the refusal explains itself.
  if (status === "ACTIVE" && subscription.status !== "ACTIVE") {
    const other = await db.mealSubscription.findFirst({
      where: {
        studentId: subscription.studentId,
        termId: subscription.termId,
        status: "ACTIVE",
        id: { not: id },
      },
      select: { plan: { select: { name: true } } },
    });
    if (other) {
      return {
        error: `${subscription.student.firstName} is already on ${other.plan.name} this term. End that plan first.`,
      };
    }
  }

  await db.mealSubscription.update({
    where: { id },
    data: {
      status: status as never,
      reason: optional(formData, "reason"),
      endsOn: status === "ENDED" ? (dateOnly(text(formData, "endsOn")) ?? new Date()) : null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "cafeteria.subscription.status",
      entity: "MealSubscription",
      entityId: id,
      summary: `${subscription.student.firstName} ${subscription.student.lastName} on ${subscription.plan.name} set to ${status.toLowerCase()}`,
    },
  });

  revalidatePath("/cafeteria/subscriptions");
  revalidatePath("/cafeteria");
  return { ok: true, message: "Updated." };
}

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

export async function saveMenuAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.menu.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const name = text(formData, "name");
  const academicYearId = text(formData, "academicYearId");
  if (!name) return { error: "Give the menu a name." };
  if (!academicYearId) return { error: "Choose the academic year." };

  const cycleWeeks = Number(text(formData, "cycleWeeks") || "2");
  if (!Number.isInteger(cycleWeeks) || cycleWeeks < 1 || cycleWeeks > 8) {
    return { error: "A cycle runs from one to eight weeks." };
  }

  const startsOn = dateOnly(text(formData, "startsOn"));
  if (!startsOn) return { error: "Choose the date the cycle counts from." };

  const data = {
    name,
    academicYearId,
    termId: optional(formData, "termId"),
    cycleWeeks,
    startsOn,
    notes: optional(formData, "notes"),
  };

  const menu = id
    ? await db.mealMenu.update({ where: { id }, data, select: { id: true } })
    : await db.mealMenu.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "cafeteria.menu.update" : "cafeteria.menu.create",
      entity: "MealMenu",
      entityId: menu.id,
      summary: `${name}, a ${cycleWeeks}-week cycle`,
    },
  });

  revalidatePath("/cafeteria/menu");
  return { ok: true, message: id ? "Menu updated." : "Menu created." };
}

/**
 * Makes one menu the live one.
 *
 * Every other menu is deactivated in the same transaction, because "what is
 * for lunch" is a question that must have one answer. The database refuses two
 * active rows, so doing this in two statements outside a transaction would
 * fail half the time depending on which ran first.
 */
export async function activateMenuAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.menu.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No menu given." };

  const menu = await db.mealMenu.findUnique({
    where: { id },
    select: { name: true, _count: { select: { items: true } } },
  });
  if (!menu) return { error: "Menu not found." };
  if (menu._count.items === 0) {
    return {
      error:
        "That menu has no dishes on it. Publishing it would leave every sitting with nothing to serve.",
    };
  }

  await db.$transaction([
    db.mealMenu.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    db.mealMenu.update({ where: { id }, data: { isActive: true } }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "cafeteria.menu.activate",
      entity: "MealMenu",
      entityId: id,
      summary: `${menu.name} is now the live menu`,
    },
  });

  revalidatePath("/cafeteria/menu");
  revalidatePath("/cafeteria");
  return { ok: true, message: `${menu.name} is now live.` };
}

export async function saveMenuItemAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  try {
    await authorize("cafeteria.menu.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const menuId = text(formData, "menuId");
  const dish = text(formData, "dish");
  if (!menuId) return { error: "No menu given." };
  if (!dish) return { error: "Name the dish." };

  const weekNumber = Number(text(formData, "weekNumber") || "1");
  const dayOfWeek = Number(text(formData, "dayOfWeek") || "1");
  const sitting = text(formData, "sitting");

  if (!SITTING_VALUES.includes(sitting as never)) return { error: "Choose the sitting." };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return { error: "Choose the day." };
  }

  const menu = await db.mealMenu.findUnique({
    where: { id: menuId },
    select: { cycleWeeks: true },
  });
  if (!menu) return { error: "Menu not found." };
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > menu.cycleWeeks) {
    return { error: `This menu runs on a ${menu.cycleWeeks}-week cycle.` };
  }

  // Allergens come from the controlled list and nowhere else. Free text here
  // would be compared against a pupil's allergies and quietly fail to match,
  // which is a warning that does not appear rather than one that is wrong.
  const allergens = formData
    .getAll("allergens")
    .map(String)
    .filter((value) => ALLERGEN_KEYS.includes(value));

  const data = {
    menuId,
    weekNumber,
    dayOfWeek,
    sitting: sitting as never,
    dish,
    accompaniment: optional(formData, "accompaniment"),
    allergens,
    isVegetarian: formData.get("isVegetarian") === "on",
    notes: optional(formData, "notes"),
  };

  try {
    if (id) await db.mealMenuItem.update({ where: { id }, data });
    else await db.mealMenuItem.create({ data });
  } catch (error) {
    if (String((error as Error).message).includes("weekNumber_dayOfWeek_sitting")) {
      return {
        error: `Week ${weekNumber} already has something for ${sittingLabel(sitting).toLowerCase()} that day. Edit it instead.`,
      };
    }
    throw error;
  }

  revalidatePath("/cafeteria/menu");
  revalidatePath("/cafeteria");
  return { ok: true, message: "Saved." };
}

export async function deleteMenuItemAction(formData: FormData): Promise<CafeteriaState> {
  try {
    await authorize("cafeteria.menu.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No dish given." };

  await db.mealMenuItem.delete({ where: { id } });
  revalidatePath("/cafeteria/menu");
  return { ok: true, message: "Removed." };
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------

/**
 * Opens a sitting, and counts who is entitled to it before anybody arrives.
 *
 * The count is stored rather than derived, because it is the number that makes
 * "who did not come to supper" answerable afterwards. Derived later it would
 * silently change every time somebody edited a subscription, and last Tuesday's
 * missing boarder would quietly stop being missing.
 */
export async function openServiceAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.serve");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const sitting = text(formData, "sitting");
  if (!SITTING_VALUES.includes(sitting as never)) return { error: "Choose the sitting." };

  const servedOn = dateOnly(text(formData, "servedOn")) ?? today();

  const existing = await db.mealService.findFirst({
    where: { servedOn, sitting: sitting as never },
    select: { id: true },
  });
  if (existing) return { ok: true, serviceId: existing.id, message: "Already open." };

  // What the rota says, if there is a live menu with something for today.
  const menu = await db.mealMenu.findFirst({
    where: { isActive: true },
    select: {
      startsOn: true,
      cycleWeeks: true,
      items: { select: { id: true, weekNumber: true, dayOfWeek: true, sitting: true, dish: true, allergens: true } },
    },
  });

  let menuItemId: string | null = null;
  let dishServed: string | null = null;
  let allergens: string[] = [];

  if (menu) {
    const week = cycleWeekFor(servedOn, menu.startsOn, menu.cycleWeeks);
    const day = isoDay(servedOn);
    const item = menu.items.find(
      (candidate) =>
        candidate.weekNumber === week &&
        candidate.dayOfWeek === day &&
        candidate.sitting === sitting,
    );
    if (item) {
      menuItemId = item.id;
      dishServed = item.dish;
      allergens = item.allergens;
    }
  }

  // Everybody whose live plan pays for this sitting, on this date.
  const subscriptions = await db.mealSubscription.findMany({
    where: {
      status: "ACTIVE",
      startsOn: { lte: servedOn },
      OR: [{ endsOn: null }, { endsOn: { gte: servedOn } }],
      plan: { sittings: { has: sitting as never } },
    },
    select: { id: true },
  });

  const service = await db.mealService.create({
    data: {
      servedOn,
      sitting: sitting as never,
      menuItemId,
      dishServed,
      allergens,
      openedById: user.id,
      expectedCount: subscriptions.length,
    },
    select: { id: true },
  });

  revalidatePath("/cafeteria");
  return {
    ok: true,
    serviceId: service.id,
    message: `${sittingLabel(sitting)} is open. ${subscriptions.length} on a plan.`,
  };
}

export async function closeServiceAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.serve");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No sitting given." };

  const service = await db.mealService.findUnique({
    where: { id },
    select: { closedAt: true, sitting: true, _count: { select: { records: true } } },
  });
  if (!service) return { error: "Sitting not found." };
  if (service.closedAt) return { error: "That sitting is already closed." };

  await db.mealService.update({
    where: { id },
    data: { closedAt: new Date(), notes: optional(formData, "notes") },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "cafeteria.service.close",
      entity: "MealService",
      entityId: id,
      summary: `${sittingLabel(service.sitting)} closed with ${service._count.records} served`,
    },
  });

  revalidatePath("/cafeteria");
  return { ok: true, message: "Sitting closed." };
}

/**
 * What the counter needs to know about one person, before serving them.
 *
 * The entitlement and the allergy check both run here rather than in the
 * browser: the browser's answer decides what the screen says, and the server's
 * answer decides what is written. If only one of them existed it would be the
 * browser's, and a stale page would serve a child a dish they cannot eat.
 */
export type DinerLookup = {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  photoUrl: string | null;
  planName: string | null;
  covered: boolean;
  basis: "PLAN" | "CASH";
  chargeMinor: number;
  note: string;
  alreadyServed: boolean;
  warnings: Warning[];
  /** False when the viewer cannot read medical records, so the screen can say so. */
  allergiesVisible: boolean;
};

export async function findDinersAction(
  serviceId: string,
  query: string,
): Promise<{ ok: true; diners: DinerLookup[] } | { ok: false; error: string }> {
  let user;
  try {
    user = await authorize("cafeteria.serve");
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const term = query.trim();
  if (term.length < 2) return { ok: true, diners: [] };

  const service = await db.mealService.findUnique({
    where: { id: serviceId },
    select: { servedOn: true, sitting: true, allergens: true, closedAt: true },
  });
  if (!service) return { ok: false, error: "That sitting does not exist." };
  if (service.closedAt) return { ok: false, error: "That sitting is closed." };

  const allergiesVisible = userCan(user, "student.medical.read");

  const students = await db.student.findMany({
    where: {
      status: "ENROLLED",
      OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { otherNames: { contains: term, mode: "insensitive" } },
        { admissionNo: { contains: term, mode: "insensitive" } },
      ],
    },
    take: 12,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      admissionNo: true,
      photoUrl: true,
      enrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
      medical: allergiesVisible
        ? { select: { allergies: true, dietaryRestrictions: true } }
        : false,
      mealSubscriptions: {
        where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
        orderBy: { startsOn: "desc" },
        take: 1,
        select: {
          status: true,
          startsOn: true,
          endsOn: true,
          plan: { select: { name: true, sittings: true, priceMinor: true, perMealMinor: true } },
        },
      },
      mealsTaken: {
        where: { serviceId },
        take: 1,
        select: { id: true },
      },
    },
  });

  // The school's own rate, used for a pupil with no plan at all.
  const fallback = await db.mealPlan.findFirst({
    where: { isActive: true, perMealMinor: { gt: 0 } },
    orderBy: { perMealMinor: "asc" },
    select: { perMealMinor: true },
  });

  const diners: DinerLookup[] = students.map((student) => {
    const subscription = student.mealSubscriptions[0] ?? null;
    const decision = entitlement(
      subscription,
      service.sitting,
      service.servedOn,
      fallback?.perMealMinor ?? 0,
    );

    const enrolment = student.enrollments[0];

    return {
      studentId: student.id,
      name: [student.firstName, student.otherNames, student.lastName]
        .filter(Boolean)
        .join(" "),
      admissionNo: student.admissionNo,
      className: enrolment
        ? `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`
        : "",
      photoUrl: student.photoUrl,
      planName: subscription?.plan.name ?? null,
      covered: decision.covered,
      basis: decision.basis,
      chargeMinor: decision.chargeMinor,
      note: decision.note,
      alreadyServed: student.mealsTaken.length > 0,
      warnings: allergiesVisible
        ? allergyWarnings(
            (student.medical?.allergies as RecordedAllergy[] | null) ?? null,
            student.medical?.dietaryRestrictions ?? null,
            service.allergens,
          )
        : [],
      allergiesVisible,
    };
  });

  return { ok: true, diners };
}

/**
 * Records one meal.
 *
 * The allergy check runs again here against the record, not against whatever
 * the browser was showing. A page left open through a change of dish, or a
 * request replayed, must not be able to record a serving that the current
 * facts would refuse.
 */
export async function serveAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.serve");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const serviceId = text(formData, "serviceId");
  const studentId = optional(formData, "studentId");
  const staffId = optional(formData, "staffId");
  const guestName = optional(formData, "guestName");

  const named = [studentId, staffId, guestName].filter(Boolean).length;
  if (named !== 1) {
    return { error: "Choose exactly one person: a pupil, a member of staff, or a guest." };
  }

  const service = await db.mealService.findUnique({
    where: { id: serviceId },
    select: { id: true, servedOn: true, sitting: true, allergens: true, closedAt: true },
  });
  if (!service) return { error: "That sitting does not exist." };
  if (service.closedAt) return { error: "That sitting is closed. Reopen it to add anybody." };

  let chargeMinor = 0;
  let basis: "PLAN" | "CASH" | "STAFF" | "GUEST" = "GUEST";
  let warned = false;
  const override = optional(formData, "override");

  if (studentId) {
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        medical: { select: { allergies: true, dietaryRestrictions: true } },
        mealSubscriptions: {
          where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
          orderBy: { startsOn: "desc" },
          take: 1,
          select: {
            status: true,
            startsOn: true,
            endsOn: true,
            plan: { select: { sittings: true, priceMinor: true, perMealMinor: true } },
          },
        },
      },
    });
    if (!student) return { error: "Student not found." };

    const warnings = allergyWarnings(
      (student.medical?.allergies as RecordedAllergy[] | null) ?? null,
      student.medical?.dietaryRestrictions ?? null,
      service.allergens,
    );

    if (needsOverride(warnings) && !override) {
      const worst = warnings.find((warning) => warning.level === "stop");
      return {
        error: `${student.firstName} has a ${worst?.severity.toLowerCase()} ${worst?.label.toLowerCase()} allergy and this dish contains it. Say what is being served instead before recording the meal.`,
      };
    }

    warned = warnings.length > 0;

    const fallback = await db.mealPlan.findFirst({
      where: { isActive: true, perMealMinor: { gt: 0 } },
      orderBy: { perMealMinor: "asc" },
      select: { perMealMinor: true },
    });

    const decision = entitlement(
      student.mealSubscriptions[0] ?? null,
      service.sitting,
      service.servedOn,
      fallback?.perMealMinor ?? 0,
    );
    basis = decision.basis;
    chargeMinor = decision.chargeMinor;
  } else if (staffId) {
    basis = "STAFF";
    chargeMinor = money(formData, "charge");
    if (chargeMinor < 0) return { error: "That is not an amount." };
  } else {
    basis = "GUEST";
    chargeMinor = money(formData, "charge");
    if (chargeMinor < 0) return { error: "That is not an amount." };
  }

  try {
    await db.mealServiceRecord.create({
      data: {
        serviceId,
        studentId,
        staffId,
        guestName,
        basis,
        chargedMinor: chargeMinor,
        servedBy: user.fullName,
        warned,
        warnedNote: override,
      },
    });
  } catch (error) {
    if (String((error as Error).message).includes("one_per_")) {
      return { error: "They have already been served at this sitting." };
    }
    throw error;
  }

  revalidatePath("/cafeteria");
  return {
    ok: true,
    message:
      chargeMinor > 0 ? `Served. ${formatMoney(chargeMinor)} to collect.` : "Served.",
  };
}

/** Undoes a serving. A counter is a place where the wrong name gets tapped. */
export async function undoServeAction(formData: FormData): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.serve");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No record given." };

  const record = await db.mealServiceRecord.findUnique({
    where: { id },
    select: {
      guestName: true,
      service: { select: { closedAt: true, sitting: true } },
      student: { select: { firstName: true, lastName: true } },
      staff: { select: { firstName: true, lastName: true } },
    },
  });
  if (!record) return { error: "That record has already gone." };
  if (record.service.closedAt) {
    return { error: "That sitting is closed. A closed register is not edited." };
  }

  await db.mealServiceRecord.delete({ where: { id } });

  const who = record.student
    ? `${record.student.firstName} ${record.student.lastName}`
    : record.staff
      ? `${record.staff.firstName} ${record.staff.lastName}`
      : (record.guestName ?? "a guest");

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "cafeteria.serve.undo",
      entity: "MealServiceRecord",
      entityId: id,
      summary: `Removed ${who} from ${sittingLabel(record.service.sitting).toLowerCase()}`,
    },
  });

  revalidatePath("/cafeteria");
  return { ok: true, message: `${who} removed.` };
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/**
 * Raises the term's meal charges onto each family's invoice.
 *
 * Every subscription is stamped with the date and amount charged inside the
 * same transaction that writes the invoice line, so a run interrupted halfway
 * cannot leave a family billed with nothing recorded, or recorded with nothing
 * billed. Running it twice finds nothing the second time.
 */
export async function billSubscriptionsAction(
  _previous: CafeteriaState,
  formData: FormData,
): Promise<CafeteriaState> {
  let user;
  try {
    user = await authorize("cafeteria.bill");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const termId = text(formData, "termId");
  if (!termId) return { error: "Choose the term." };

  const term = await db.term.findUnique({
    where: { id: termId },
    select: { name: true, academicYearId: true },
  });
  if (!term) return { error: "Term not found." };

  const subscriptions = await db.mealSubscription.findMany({
    where: { termId, chargedAt: null, plan: { priceMinor: { gt: 0 } } },
    select: {
      id: true,
      studentId: true,
      plan: { select: { name: true, priceMinor: true } },
    },
  });

  if (!subscriptions.length) {
    return { error: "Every meal plan for that term has already been charged." };
  }

  let billed = 0;
  let totalMinor = 0;
  const skipped: string[] = [];

  for (const subscription of subscriptions) {
    // The family's invoice for this term. A meal plan is a fee line, not an
    // invoice of its own: a parent should get one bill, not two.
    const invoice = await db.invoice.findFirst({
      where: {
        studentId: subscription.studentId,
        termId,
        status: { notIn: ["CANCELLED", "PAID"] },
      },
      orderBy: { issueDate: "desc" },
      select: { id: true, subtotalMinor: true, totalMinor: true, balanceMinor: true },
    });

    if (!invoice) {
      skipped.push(subscription.studentId);
      continue;
    }

    await db.$transaction([
      db.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          description: `${subscription.plan.name} (${term.name})`,
          quantity: 1,
          unitPriceMinor: subscription.plan.priceMinor,
          amountMinor: subscription.plan.priceMinor,
          sortKey: 500,
        },
      }),
      db.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotalMinor: invoice.subtotalMinor + subscription.plan.priceMinor,
          totalMinor: invoice.totalMinor + subscription.plan.priceMinor,
          balanceMinor: invoice.balanceMinor + subscription.plan.priceMinor,
        },
      }),
      db.mealSubscription.update({
        where: { id: subscription.id },
        data: { chargedAt: new Date(), chargedMinor: subscription.plan.priceMinor },
      }),
    ]);

    billed += 1;
    totalMinor += subscription.plan.priceMinor;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "cafeteria.bill",
      entity: "Term",
      entityId: termId,
      summary: `${billed} meal plans charged for ${term.name}, ${formatMoney(totalMinor)}`,
    },
  });

  revalidatePath("/cafeteria/subscriptions");
  revalidatePath("/finance");

  // The skipped ones are named as a count rather than swallowed. A pupil with
  // no invoice for the term is a real gap in the billing run, and a message
  // saying "42 charged" with no mention of the other three is how it stays
  // hidden until a parent notices they were never charged for lunch.
  return {
    ok: true,
    message: skipped.length
      ? `${billed} charged, ${formatMoney(totalMinor)}. ${skipped.length} could not be: those pupils have no open invoice for ${term.name}. Generate their bills first, then run this again.`
      : `${billed} charged, ${formatMoney(totalMinor)}.`,
  };
}
