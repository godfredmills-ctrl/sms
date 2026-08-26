/**
 * Which panels each kind of person sees, and in what order.
 *
 * The dashboard claims to be tailored; this prints what that actually means
 * per role, so a change to the ordering rules shows its consequences rather
 * than being argued about in the abstract.
 *
 *   npx tsx scripts/check-dashboard.ts
 */
import { panelsFor, roleSummaryFor } from "../src/lib/dashboard";

const ROLES: Record<string, string[]> = {
  "form teacher": [
    "dashboard.view", "student.read.own", "student.update", "student.medical.read",
    "attendance.take", "attendance.read", "assessment.grade", "lms.quiz.manage",
    "communication.message", "staff.leave.manage",
  ],
  teacher: [
    "dashboard.view", "student.read.own", "attendance.take", "assessment.grade",
    "lms.quiz.manage", "communication.message",
  ],
  bursar: [
    "dashboard.view", "dashboard.finance", "finance.read", "finance.payment.record",
    "payroll.read", "payroll.manage", "student.read", "communication.message",
  ],
  "head teacher": [
    "dashboard.view", "dashboard.management", "student.read", "finance.read",
    "payroll.read", "payroll.approve", "staff.leave.manage", "communication.message",
    "student.create",
  ],
  nurse: [
    "dashboard.view", "student.medical.read", "student.medical.update",
    "communication.message",
  ],
  registrar: [
    "dashboard.view", "student.read", "student.create", "student.import",
    "communication.message",
  ],
};

for (const [role, permissions] of Object.entries(ROLES)) {
  const viewer = { staffId: "staff_1", permissions: new Set(permissions) };
  console.log(
    role.padEnd(14),
    (roleSummaryFor(viewer) ?? "-").padEnd(18),
    panelsFor(viewer).join(" → "),
  );
}

// A guardian has no staff record: the personal staff panels must vanish.
const guardian = { staffId: null, permissions: new Set(["communication.message"]) };
console.log("guardian".padEnd(14), "-".padEnd(18), panelsFor(guardian).join(" → ") || "(none)");
