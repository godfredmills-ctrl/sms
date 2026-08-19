/**
 * Whose dashboard is this?
 *
 * The dashboard used to show everyone the same school: a headcount, an
 * attendance trend, subject averages, and a fee panel for the people allowed
 * to see money. That is a report, not a dashboard. A nurse opening it wanted
 * to know who was in the clinic; a form teacher wanted to know which of her
 * registers were still untaken; the bursar wanted today's takings — and all
 * three got a bar chart of enrolment by class level.
 *
 * So the page is assembled from panels, and this file decides which panels a
 * person sees and in what order. The ordering rule is the same for everyone,
 * which is what makes it feel personal rather than arbitrary:
 *
 *   1. What is waiting on YOU today — the register not taken, the leave
 *      request unanswered, the payroll draft nobody has approved.
 *   2. What you are RESPONSIBLE for — your classes, the clinic, the money,
 *      the admissions pipeline.
 *   3. How the SCHOOL is doing — the wide view, for the people whose job
 *      that actually is.
 *
 * A panel with nothing to say renders nothing at all, so a quiet day is a
 * short page rather than a wall of zeroes.
 */

export type PanelKey =
  | "myDay"
  | "myMarking"
  | "myRegisters"
  | "approvals"
  | "clinicToday"
  | "moneyToday"
  | "payrollStatus"
  | "admissionsPipeline"
  | "schoolPulse"
  | "myPay"
  | "comingUp";

type PanelRule = {
  key: PanelKey;
  /** Any one of these reveals the panel. Empty means everyone signed in. */
  permissions?: string[];
  /** Needs a linked staff record — a personal panel, not an office one. */
  needsStaff?: boolean;
  /**
   * Lower sorts first. Panels are grouped by what they answer:
   *   0–19   waiting on you
   *   20–39  your responsibility
   *   40–59  the school
   *   60+    the long tail
   */
  weight: number;
  /**
   * When the viewer holds any of these, the panel moves to the front —
   * this is what makes a bursar's money panel outrank a teacher's, and a
   * teacher's classes outrank the school-wide chart.
   */
  promoteFor?: { permissions: string[]; weight: number };
};

const PANELS: PanelRule[] = [
  // --- Waiting on you -------------------------------------------------------
  {
    key: "myDay",
    needsStaff: true,
    weight: 5,
  },
  {
    key: "myRegisters",
    permissions: ["attendance.take"],
    needsStaff: true,
    weight: 6,
  },
  {
    key: "approvals",
    weight: 10,
  },
  {
    key: "myMarking",
    permissions: ["assessment.grade", "lms.quiz.manage"],
    needsStaff: true,
    weight: 12,
  },

  // --- Your responsibility --------------------------------------------------
  {
    key: "clinicToday",
    permissions: ["student.medical.read"],
    weight: 30,
    // The nurse's whole job. For a form teacher who also holds the
    // permission it stays where it is: useful, not the first thing.
    promoteFor: { permissions: ["student.medical.update"], weight: 8 },
  },
  {
    key: "moneyToday",
    permissions: ["finance.read"],
    weight: 32,
    promoteFor: { permissions: ["finance.payment.record"], weight: 7 },
  },
  {
    key: "payrollStatus",
    permissions: ["payroll.read"],
    weight: 33,
    promoteFor: { permissions: ["payroll.approve", "payroll.manage"], weight: 9 },
  },
  {
    key: "admissionsPipeline",
    permissions: ["student.create"],
    weight: 34,
    promoteFor: { permissions: ["student.import"], weight: 11 },
  },

  // --- The school -----------------------------------------------------------
  {
    key: "schoolPulse",
    permissions: ["dashboard.management", "report.read"],
    weight: 45,
    // For a head teacher this IS the job, so it climbs above the
    // responsibilities but never above what is waiting on them today.
    promoteFor: { permissions: ["dashboard.management"], weight: 25 },
  },

  // --- The long tail --------------------------------------------------------
  { key: "myPay", needsStaff: true, weight: 62 },
  { key: "comingUp", weight: 65 },
];

export type DashboardViewer = {
  staffId?: string | null;
  permissions: Set<string>;
};

function holdsAny(viewer: DashboardViewer, keys: string[]): boolean {
  return keys.some((key) => viewer.permissions.has(key));
}

/** The panels this person sees, in the order they should read them. */
export function panelsFor(viewer: DashboardViewer): PanelKey[] {
  return PANELS.filter((panel) => {
    if (panel.needsStaff && !viewer.staffId) return false;
    if (panel.permissions && !holdsAny(viewer, panel.permissions)) return false;
    return true;
  })
    .map((panel) => ({
      key: panel.key,
      weight:
        panel.promoteFor && holdsAny(viewer, panel.promoteFor.permissions)
          ? panel.promoteFor.weight
          : panel.weight,
    }))
    .sort((a, b) => a.weight - b.weight)
    .map((panel) => panel.key);
}

/**
 * A one-line description of what this person does here, used under the
 * greeting. Derived from what they can do rather than from a job title,
 * because the job title is free text and the permissions are the truth.
 */
export function roleSummaryFor(viewer: DashboardViewer): string | null {
  const has = (key: string) => viewer.permissions.has(key);

  if (has("dashboard.management")) return "Your school today";
  if (has("payroll.manage") || has("finance.payment.record")) return "The money today";
  if (has("student.medical.update")) return "The clinic today";
  if (has("student.import") || has("student.create")) return "Admissions today";
  if (has("attendance.take")) return "Your day";
  return null;
}
