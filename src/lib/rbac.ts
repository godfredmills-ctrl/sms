import type { PortalType } from "@prisma/client";

/**
 * The permission catalogue. This is the single source of truth: it is seeded
 * into the database, drives the role editor, and gates both navigation and
 * server actions. Keys are `<module>.<subject>.<action>` or `<module>.<action>`.
 */

export type PermissionDef = {
  key: string;
  module: string;
  action: string;
  description: string;
};

function define(module: string, entries: Array<[string, string, string]>): PermissionDef[] {
  return entries.map(([key, action, description]) => ({
    key: `${module}.${key}`,
    module,
    action,
    description,
  }));
}

export const PERMISSIONS: PermissionDef[] = [
  ...define("dashboard", [
    ["view", "read", "View the staff dashboard"],
    ["management", "read", "View school-wide management statistics"],
    ["finance", "read", "View financial figures on dashboards"],
  ]),

  ...define("student", [
    ["read", "read", "View student records"],
    ["read.own", "read", "View only students in own classes"],
    ["create", "create", "Admit and create student records"],
    ["update", "update", "Edit student records"],
    ["delete", "delete", "Delete student records"],
    ["medical.read", "read", "View student medical history and allergies"],
    ["medical.update", "update", "Edit student medical records"],
    ["background.read", "read", "View sensitive background information"],
    ["guardian.manage", "update", "Link and manage guardians and family tree"],
    ["document.manage", "update", "Upload and manage student documents"],
    ["discipline.manage", "update", "Record and manage disciplinary cases"],
    ["promote", "update", "Promote, repeat or graduate students"],
    ["export", "read", "Export student data"],
    ["import", "create", "Bulk import students"],
  ]),

  ...define("payroll", [
    ["read", "read", "View payroll runs and payslips"],
    ["manage", "update", "Prepare payroll runs and set salaries"],
    ["approve", "approve", "Approve payroll and mark it paid"],
  ]),

  ...define("staff", [
    ["read", "read", "View staff records"],
    ["create", "create", "Create staff records"],
    ["update", "update", "Edit staff records"],
    ["delete", "delete", "Delete staff records"],
    ["leave.manage", "update", "Approve and manage staff leave"],
    ["export", "read", "Export staff data"],
  ]),

  ...define("academic", [
    ["structure.read", "read", "View classes, subjects and the curriculum map"],
    ["structure.manage", "update", "Manage classes, levels, subjects and streams"],
    ["year.manage", "update", "Manage academic years and terms"],
    ["timetable.read", "read", "View timetables"],
    ["timetable.manage", "update", "Build and edit timetables"],
    ["enrollment.manage", "update", "Enrol and transfer students between classes"],
  ]),

  ...define("attendance", [
    ["read", "read", "View attendance records"],
    ["take", "create", "Take and submit attendance"],
    ["update", "update", "Amend submitted attendance"],
    ["report", "read", "View attendance analytics and registers"],
  ]),

  ...define("assessment", [
    ["read", "read", "View assessments and scores"],
    ["create", "create", "Create assessments"],
    ["grade", "update", "Enter and edit marks"],
    ["publish", "approve", "Publish assessment results to portals"],
    ["scale.manage", "update", "Manage grading scales and bands"],
    ["report.generate", "create", "Generate terminal or semester report cards"],
    ["report.approve", "approve", "Approve and publish report cards"],
    ["transcript.generate", "create", "Generate transcripts"],
    ["certificate.issue", "create", "Issue certificates"],
    ["template.manage", "update", "Manage transcript and certificate templates"],
  ]),

  ...define("finance", [
    ["read", "read", "View invoices, payments and balances"],
    ["fee.manage", "update", "Manage fee categories and fee structures"],
    ["invoice.create", "create", "Generate bills and invoices"],
    ["invoice.update", "update", "Edit or cancel invoices"],
    ["payment.record", "create", "Record payments and issue receipts"],
    ["payment.reverse", "delete", "Reverse or refund payments"],
    ["discount.manage", "update", "Grant discounts, waivers and scholarships"],
    ["plan.manage", "update", "Create and manage payment plans"],
    ["reminder.manage", "update", "Configure automated fee reminders"],
    ["reconcile", "update", "Reconcile provider settlements"],
    ["report", "read", "View financial reports"],
  ]),

  ...define("communication", [
    ["announcement.read", "read", "View announcements"],
    ["announcement.manage", "update", "Create and publish announcements"],
    ["email.send", "create", "Send emails to school audiences"],
    ["sms.send", "create", "Send SMS to school audiences"],
    ["push.send", "create", "Send push notifications"],
    ["memo.read", "read", "View memos"],
    ["memo.create", "create", "Draft memos"],
    ["memo.approve", "approve", "Approve and issue memos"],
    ["template.manage", "update", "Manage message templates"],
    ["message", "create", "Use internal messaging"],
    ["log.read", "read", "View delivery logs and costs"],
  ]),

  ...define("document", [
    ["read", "read", "View the document cabinet"],
    ["upload", "create", "Upload documents"],
    ["update", "update", "Edit document metadata and versions"],
    ["delete", "delete", "Delete documents"],
    ["folder.manage", "update", "Manage folders and access levels"],
  ]),

  ...define("election", [
    ["read", "read", "View elections and results"],
    ["manage", "update", "Create and configure elections"],
    ["candidate.approve", "approve", "Approve or disqualify candidates"],
    ["vote", "create", "Cast a vote"],
    ["result.publish", "approve", "Publish election results"],
  ]),

  ...define("lms", [
    ["course.read", "read", "View courses"],
    ["course.manage", "update", "Create and manage courses and lessons"],
    ["assignment.manage", "update", "Create and grade assignments"],
    ["quiz.manage", "update", "Create and manage quizzes"],
    ["submit", "create", "Submit assignments and take quizzes"],
    ["discussion", "create", "Participate in course discussions"],
  ]),

  ...define("report", [
    ["read", "read", "View saved reports"],
    ["build", "create", "Build custom reports"],
    ["export", "read", "Export report output"],
    ["schedule", "update", "Schedule automated report delivery"],
  ]),

  ...define("ai", [
    ["insight.view", "read", "View AI-generated insights"],
    ["insight.generate", "create", "Generate AI insights"],
    ["config", "update", "Configure AI settings and prompts"],
  ]),

  ...define("website", [
    ["read", "read", "View the website builder"],
    ["manage", "update", "Edit pages, media and menus"],
    ["publish", "approve", "Publish the public website"],
    ["enquiry.manage", "update", "Read and handle website enquiries and newsletter sign-ups"],
  ]),

  ...define("visitor", [
    ["read", "read", "View the visitor log"],
    ["manage", "update", "Sign visitors in and out, and issue passes"],
  ]),

  ...define("library", [
    ["read", "read", "Search the library catalogue"],
    ["circulate", "update", "Issue and take back books at the desk"],
    ["manage", "update", "Add and edit titles, copies and shelf marks"],
  ]),

  ...define("settings", [
    ["read", "read", "View system settings"],
    ["school.manage", "update", "Edit school profile and branding"],
    ["option.manage", "update", "Manage customisable dropdown options"],
    ["customfield.manage", "update", "Manage custom fields"],
    ["integration.manage", "update", "Configure payment, SMS and email providers"],
  ]),

  ...define("user", [
    ["read", "read", "View user accounts"],
    ["manage", "update", "Create, invite and deactivate users"],
    ["role.manage", "update", "Manage roles and permissions"],
    ["impersonate", "update", "Sign in as another user for support"],
    ["audit.read", "read", "View the audit trail"],
  ]),

  ...define("portal", [
    ["student", "read", "Access the student portal"],
    ["guardian", "read", "Access the parent/guardian portal"],
    ["fees.pay", "create", "Make fee payments online"],
    ["results.view", "read", "View published results and report cards"],
  ]),
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const PERMISSION_MODULES = Array.from(
  new Set(PERMISSIONS.map((p) => p.module)),
);

/** Grants every permission whose key starts with one of the given prefixes. */
function expand(...prefixes: string[]): string[] {
  return PERMISSION_KEYS.filter((key) =>
    prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)),
  );
}

export type RolePreset = {
  key: string;
  name: string;
  description: string;
  portal: PortalType;
  rank: number;
  /** "*" means every permission. */
  permissions: string[] | "*";
};

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: "super_admin",
    name: "System Administrator",
    description: "Unrestricted access to every module and setting.",
    portal: "STAFF",
    rank: 0,
    permissions: "*",
  },
  {
    key: "head_teacher",
    name: "Head Teacher / Principal",
    description: "School-wide oversight, approvals and management reporting.",
    portal: "STAFF",
    rank: 10,
    permissions: [
      ...expand(
        "dashboard",
        "student",
        "staff",
        "academic",
        "attendance",
        "assessment",
        "communication",
        "document",
        "election",
        "lms",
        "report",
        "ai",
        "website",
        "visitor",
        "library",
      ),
      "finance.read",
      "finance.report",
      "finance.discount.manage",
      "payroll.read",
      "payroll.approve",
      "settings.read",
      "settings.school.manage",
      "user.read",
      "user.manage",
      "user.audit.read",
    ],
  },
  {
    key: "assistant_head",
    name: "Assistant Head",
    description: "Day-to-day academic and pastoral administration.",
    portal: "STAFF",
    rank: 20,
    permissions: [
      ...expand("dashboard.view", "student", "academic", "attendance", "assessment", "lms"),
      ...expand("communication", "document", "election", "report"),
      "website.enquiry.manage",
      "visitor.read",
      "ai.insight.view",
      "ai.insight.generate",
      "staff.read",
    ],
  },
  {
    key: "bursar",
    name: "Bursar / Accountant",
    description: "Full control of billing, payments, reminders and finance reports.",
    portal: "STAFF",
    rank: 25,
    permissions: [
      "dashboard.view",
      "dashboard.finance",
      ...expand("finance"),
      "payroll.read",
      "payroll.manage",
      "student.read",
      "student.export",
      "communication.announcement.read",
      "communication.sms.send",
      "communication.email.send",
      "communication.template.manage",
      "communication.log.read",
      "document.read",
      "document.upload",
      "report.read",
      "report.build",
      "report.export",
      "ai.insight.view",
      "ai.insight.generate",
      "user.read",
    ],
  },
  {
    key: "registrar",
    name: "Registrar / Admissions",
    description: "Admissions, enrolment, records, transcripts and certificates.",
    portal: "STAFF",
    rank: 30,
    permissions: [
      "dashboard.view",
      ...expand("student"),
      "academic.structure.read",
      "academic.enrollment.manage",
      "assessment.read",
      "assessment.transcript.generate",
      "assessment.certificate.issue",
      "assessment.template.manage",
      ...expand("document"),
      // Admissions runs the enquiry inbox: an enquiry is a prospective
      // student, which is the registrar's work before it is anyone else's.
      "website.enquiry.manage",
      "visitor.read",
      "communication.announcement.read",
      "communication.email.send",
      "communication.sms.send",
      "report.read",
      "report.build",
      "report.export",
      "finance.read",
    ],
  },
  {
    key: "teacher",
    name: "Teacher / Lecturer",
    description: "Own classes: attendance, marks, courses and student progress.",
    portal: "STAFF",
    rank: 50,
    permissions: [
      "dashboard.view",
      "student.read.own",
      "student.medical.read",
      "academic.structure.read",
      "academic.timetable.read",
      "attendance.read",
      "attendance.take",
      "attendance.update",
      "attendance.report",
      "assessment.read",
      "assessment.create",
      "assessment.grade",
      "assessment.report.generate",
      ...expand("lms"),
      "library.read",
      "communication.announcement.read",
      "communication.memo.read",
      "communication.message",
      "document.read",
      "document.upload",
      "election.read",
      "election.vote",
      "ai.insight.view",
      "ai.insight.generate",
      // Deliberately NOT report.read: it gates whole-school analytics and
      // the custom report builder, whose datasets are school-wide.
    ],
  },
  {
    key: "form_teacher",
    name: "Form Teacher / Class Tutor",
    description: "A teacher who also owns a class register and its report cards.",
    portal: "STAFF",
    rank: 45,
    permissions: [
      "dashboard.view",
      "student.read.own",
      "student.update",
      "student.medical.read",
      "student.guardian.manage",
      "student.discipline.manage",
      "academic.structure.read",
      "academic.timetable.read",
      ...expand("attendance"),
      "assessment.read",
      "assessment.create",
      "assessment.grade",
      "assessment.report.generate",
      ...expand("lms"),
      "communication.announcement.read",
      "communication.memo.read",
      "communication.message",
      "communication.sms.send",
      "document.read",
      "document.upload",
      "election.read",
      "election.vote",
      "ai.insight.view",
      "ai.insight.generate",
      // Deliberately NOT finance.read: that opens the whole finance module —
      // every invoice and payment in the school — and a form teacher who
      // needs to know a family is in arrears asks the bursar.
      // Deliberately NOT report.read: it is the gate on school-wide
      // analytics and the custom report builder.
    ],
  },
  {
    key: "nurse",
    name: "School Nurse",
    description: "Medical records, clinic visits and health alerts.",
    portal: "STAFF",
    rank: 60,
    permissions: [
      "dashboard.view",
      "student.read",
      "student.medical.read",
      "student.medical.update",
      "communication.announcement.read",
      "communication.sms.send",
      "communication.message",
      "document.read",
      "document.upload",
      "report.read",
    ],
  },
  {
    key: "librarian",
    name: "Librarian",
    description: "The library catalogue, the issue desk and the document cabinet.",
    portal: "STAFF",
    rank: 65,
    permissions: [
      "dashboard.view",
      // The desk needs to find any child by name to issue them a book, so
      // this is the whole school by design — see seesWholeSchool in scope.ts,
      // which reads student.read as exactly that signal.
      "student.read",
      ...expand("library"),
      ...expand("document"),
      "lms.course.read",
      "communication.announcement.read",
      "communication.message",
    ],
  },
  {
    key: "front_desk",
    name: "Front Desk / Secretary",
    description: "Enquiries, visitor records and routine communication.",
    portal: "STAFF",
    rank: 70,
    permissions: [
      "dashboard.view",
      "student.read",
      "staff.read",
      "website.enquiry.manage",
      "visitor.read",
      "visitor.manage",
      "library.read",
      "library.circulate",
      "communication.announcement.read",
      "communication.announcement.manage",
      "communication.email.send",
      "communication.sms.send",
      "communication.memo.read",
      "communication.message",
      "document.read",
      "document.upload",
      "finance.read",
    ],
  },
  {
    key: "student",
    name: "Student",
    description: "Student portal: results, timetable, courses, fees and voting.",
    portal: "STUDENT",
    rank: 200,
    permissions: [
      "portal.student",
      "portal.results.view",
      "communication.announcement.read",
      "communication.message",
      "lms.course.read",
      "lms.submit",
      "lms.discussion",
      "election.read",
      "election.vote",
      "document.read",
      // Search the catalogue and see what they themselves have out. The
      // library page narrows to the viewer's own loans for a portal account —
      // read here is the catalogue, not the borrowing history of the school.
      "library.read",
    ],
  },
  {
    key: "guardian",
    name: "Parent / Guardian",
    description: "Guardian portal: children's progress, attendance, fees and payments.",
    portal: "GUARDIAN",
    rank: 210,
    permissions: [
      "portal.guardian",
      "portal.results.view",
      "portal.fees.pay",
      "communication.announcement.read",
      "communication.message",
      "document.read",
      "library.read",
    ],
  },
];

// -----------------------------------------------------------------------------
// Runtime checks
// -----------------------------------------------------------------------------

export const SUPER_ADMIN_ROLE = "super_admin";

export type Grantee = {
  roleKeys: string[];
  permissions: Set<string>;
};

export function isSuperAdmin(grantee: Pick<Grantee, "roleKeys">): boolean {
  return grantee.roleKeys.includes(SUPER_ADMIN_ROLE);
}

export function can(grantee: Grantee, permission: string): boolean {
  if (isSuperAdmin(grantee)) return true;
  return grantee.permissions.has(permission);
}

export function canAny(grantee: Grantee, permissions: string[]): boolean {
  if (isSuperAdmin(grantee)) return true;
  return permissions.some((permission) => grantee.permissions.has(permission));
}

export function canAll(grantee: Grantee, permissions: string[]): boolean {
  if (isSuperAdmin(grantee)) return true;
  return permissions.every((permission) => grantee.permissions.has(permission));
}
