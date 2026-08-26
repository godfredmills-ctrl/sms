/**
 * Navigation model. Each item declares the permissions that reveal it, so the
 * sidebar is derived from the role rather than maintained separately.
 */

export type NavItem = {
  label: string;
  href: string;
  /** Lucide icon name, resolved in the shell. */
  icon: string;
  /** Any one of these grants visibility. Empty means "everyone signed in". */
  permissions?: string[];
  badge?: "unreadNotifications";
  /**
   * Set by the shell, not by this file: the viewer lacks the permission, so
   * the row is shown greyed and padlocked rather than hidden. Seeing that a
   * module exists and is not yours is more honest than a menu that quietly
   * differs for everyone — and it tells a person what to ask for.
   */
  locked?: boolean;
  children?: Array<{
    label: string;
    href: string;
    /** Lucide icon name; submenu rows carry their own icon like the parents. */
    icon?: string;
    permissions?: string[];
    locked?: boolean;
  }>;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const STAFF_NAVIGATION: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      {
        label: "Analytics",
        href: "/analytics",
        icon: "TrendingUp",
        permissions: ["dashboard.management", "report.read"],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Students",
        href: "/students",
        icon: "GraduationCap",
        permissions: ["student.read", "student.read.own"],
        children: [
          { label: "All students", href: "/students", icon: "Users" },
          {
            label: "Admissions",
            href: "/admissions",
            icon: "ClipboardList",
            permissions: ["admission.read", "admission.manage", "admission.offer"],
          },
          {
            label: "Admit a pupil",
            href: "/students/new",
            icon: "UserPlus",
            permissions: ["student.create"],
          },
          {
            label: "Guardians",
            href: "/guardians",
            icon: "Contact",
            permissions: ["student.read"],
          },
          {
            label: "Import",
            href: "/students/import",
            icon: "FileUp",
            permissions: ["student.import"],
          },
          {
            label: "Discipline",
            href: "/students/discipline",
            icon: "ShieldAlert",
            permissions: ["student.discipline.manage"],
          },
          {
            label: "Boarding list",
            href: "/students/boarding",
            icon: "BedDouble",
            permissions: ["student.read"],
          },
          {
            label: "ID cards",
            href: "/students/id-cards",
            icon: "IdCard",
            permissions: ["student.read", "staff.read"],
          },
        ],
      },
      {
        label: "Leave",
        href: "/leave",
        icon: "CalendarOff",
      },
      // Ungated like Leave: everyone with a staff record is paid, and the
      // page scopes to the viewer's own payslips.
      {
        label: "My Payslips",
        href: "/payroll/mine",
        icon: "Receipt",
      },
      {
        label: "Clinic",
        href: "/clinic",
        icon: "Stethoscope",
        permissions: ["student.medical.read"],
      },
      {
        label: "Boarding",
        href: "/boarding",
        icon: "BedDouble",
        permissions: ["boarding.read", "boarding.manage", "boarding.gate"],
        children: [
          { label: "Overview", href: "/boarding", icon: "LayoutDashboard" },
          { label: "Leave-out", href: "/boarding/exeat", icon: "DoorOpen" },
          {
            label: "Houses & rooms",
            href: "/boarding/houses",
            icon: "Building2",
            permissions: ["boarding.manage"],
          },
        ],
      },
      {
        label: "Staff",
        href: "/staff",
        icon: "Users",
        permissions: ["staff.read"],
        children: [
          { label: "All staff", href: "/staff", icon: "Users" },
          {
            label: "Add staff",
            href: "/staff/new",
            icon: "UserPlus",
            permissions: ["staff.create"],
          },
          // Also under Students; listed here too because a child link cannot
          // resurrect a hidden parent, and an HR-style role with staff.read
          // but no student.read would otherwise have no way in at all.
          {
            label: "ID cards",
            href: "/students/id-cards",
            icon: "IdCard",
            permissions: ["staff.read"],
          },
        ],
      },
    ],
  },
  {
    label: "Academics",
    items: [
      // Ungated: every staff member has a week, and the page itself scopes
      // to the viewer's own staffId. It sits outside /academics because that
      // segment's layout demands academic.structure.read.
      {
        label: "My Timetable",
        href: "/my-timetable",
        icon: "Clock",
      },
      {
        label: "Classes & Subjects",
        href: "/academics",
        icon: "BookOpen",
        permissions: ["academic.structure.read"],
        children: [
          { label: "Class sections", href: "/academics/classes", icon: "School" },
          { label: "Subjects", href: "/academics/subjects", icon: "BookMarked" },
          {
            label: "Academic years",
            href: "/academics/years",
            icon: "CalendarRange",
            permissions: ["academic.year.manage"],
          },
          {
            label: "Timetable",
            href: "/academics/timetable",
            icon: "CalendarClock",
            permissions: ["academic.timetable.read"],
          },
          {
            label: "Calendar",
            href: "/academics/calendar",
            icon: "CalendarDays",
          },
          {
            label: "Promotions",
            href: "/academics/promotions",
            icon: "ArrowUpRight",
            permissions: ["student.promote"],
          },
        ],
      },
      {
        label: "Attendance",
        href: "/attendance",
        icon: "CalendarCheck",
        permissions: ["attendance.read", "attendance.take"],
      },
      {
        label: "Gradebook",
        href: "/gradebook",
        icon: "ClipboardList",
        permissions: ["assessment.read", "assessment.grade"],
      },
      {
        label: "Examinations",
        href: "/exams",
        icon: "ClipboardList",
        permissions: [
          "assessment.exam.read",
          "assessment.exam.manage",
          "assessment.exam.attendance",
        ],
        children: [
          { label: "Sittings", href: "/exams", icon: "CalendarClock" },
          {
            label: "Halls",
            href: "/exams/venues",
            icon: "DoorOpen",
            permissions: ["assessment.exam.manage"],
          },
        ],
      },
      {
        label: "Report Cards",
        href: "/reports/cards",
        icon: "FileText",
        permissions: ["assessment.report.generate", "assessment.read"],
      },
      {
        label: "Transcripts & Certificates",
        href: "/credentials",
        icon: "Award",
        permissions: ["assessment.transcript.generate", "assessment.certificate.issue"],
        children: [
          { label: "Issue", href: "/credentials", icon: "Award" },
          {
            label: "Templates",
            href: "/credentials/templates",
            icon: "LayoutTemplate",
            permissions: ["assessment.template.manage"],
          },
        ],
      },
    ],
  },
  {
    label: "Learning",
    items: [
      {
        label: "Library",
        href: "/library",
        icon: "Library",
        permissions: ["library.read"],
        children: [
          { label: "Catalogue", href: "/library", icon: "BookOpen" },
          {
            label: "Issue desk",
            href: "/library/loans",
            icon: "BookUp",
            permissions: ["library.circulate"],
          },
        ],
      },
      {
        label: "Courses (VLE)",
        href: "/lms",
        icon: "MonitorPlay",
        permissions: ["lms.course.read", "lms.course.manage"],
        children: [
          { label: "All courses", href: "/lms", icon: "MonitorPlay" },
          {
            label: "Question bank",
            href: "/lms/bank",
            icon: "Library",
            permissions: ["lms.quiz.manage"],
          },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Fees & Billing",
        href: "/finance",
        icon: "Wallet",
        permissions: ["finance.read"],
        children: [
          { label: "Overview", href: "/finance", icon: "LayoutDashboard" },
          { label: "Invoices", href: "/finance/invoices", icon: "FileText" },
          { label: "Payments", href: "/finance/payments", icon: "Receipt" },
          {
            label: "Fee structures",
            href: "/finance/structures",
            icon: "Layers",
            permissions: ["finance.fee.manage"],
          },
          {
            label: "Discounts",
            href: "/finance/discounts",
            icon: "TicketPercent",
            permissions: ["finance.discount.manage"],
          },
          {
            label: "Reminders",
            href: "/finance/reminders",
            icon: "BellRing",
            permissions: ["finance.reminder.manage"],
          },
        ],
      },
      {
        label: "Expenditure",
        href: "/finance/expenses",
        icon: "HandCoins",
        permissions: ["finance.expense.read"],
        children: [
          { label: "Bills", href: "/finance/expenses", icon: "ReceiptText" },
          { label: "Vendors & categories", href: "/finance/vendors", icon: "Store" },
          {
            label: "Budget",
            href: "/finance/budget",
            icon: "Target",
            permissions: ["finance.budget.manage"],
          },
          {
            label: "Income & expenditure",
            href: "/finance/statement",
            icon: "Scale",
            permissions: ["finance.report"],
          },
        ],
      },
      {
        label: "General Ledger",
        href: "/finance/ledger",
        icon: "BookOpen",
        permissions: ["finance.ledger.read"],
        children: [
          { label: "Ledger", href: "/finance/ledger", icon: "BookOpen" },
          {
            label: "Chart of accounts",
            href: "/finance/ledger/accounts",
            icon: "ListTree",
            permissions: ["finance.ledger.manage"],
          },
          {
            label: "New entry",
            href: "/finance/ledger/new",
            icon: "Plus",
            permissions: ["finance.ledger.record"],
          },
        ],
      },
      {
        label: "Payroll",
        href: "/payroll",
        icon: "Banknote",
        permissions: ["payroll.read"],
        children: [
          { label: "Runs", href: "/payroll", icon: "CalendarRange" },
          {
            label: "Salaries",
            href: "/payroll/salaries",
            icon: "Users",
            permissions: ["payroll.read"],
          },
        ],
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        label: "Announcements",
        href: "/communications/announcements",
        icon: "Megaphone",
        permissions: ["communication.announcement.read"],
      },
      {
        label: "Send Message",
        href: "/communications/compose",
        icon: "Send",
        permissions: [
          "communication.email.send",
          "communication.sms.send",
          "communication.push.send",
        ],
      },
      {
        label: "Memos",
        href: "/communications/memos",
        icon: "FileSignature",
        permissions: ["communication.memo.read"],
      },
      {
        label: "Inbox",
        href: "/messages",
        icon: "MessageSquare",
        permissions: ["communication.message"],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Visitors",
        href: "/visitors",
        icon: "DoorOpen",
        permissions: ["visitor.read"],
      },
      {
        label: "Transport",
        href: "/transport",
        icon: "Bus",
        permissions: ["transport.read"],
      },
      {
        label: "Store",
        href: "/stores",
        icon: "Package",
        permissions: ["stock.read"],
        children: [
          { label: "Stock", href: "/stores", icon: "Package" },
          {
            label: "Categories",
            href: "/stores/categories",
            icon: "Tags",
            permissions: ["stock.manage"],
          },
        ],
      },
      {
        label: "Assets",
        href: "/assets",
        icon: "Boxes",
        permissions: ["asset.read"],
        children: [
          { label: "Register", href: "/assets", icon: "Boxes" },
          {
            label: "Categories",
            href: "/assets/categories",
            icon: "Tags",
            permissions: ["asset.manage"],
          },
          {
            label: "Locations",
            href: "/assets/locations",
            icon: "MapPin",
            permissions: ["asset.manage"],
          },
        ],
      },
      {
        label: "Letters & Reports",
        href: "/letters",
        icon: "PenLine",
        permissions: ["letter.read"],
      },
      {
        label: "Documents",
        href: "/documents",
        icon: "FolderOpen",
        permissions: ["document.read"],
      },
      {
        label: "Elections",
        href: "/elections",
        icon: "Vote",
        permissions: ["election.read"],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: "BarChart3",
        permissions: ["report.read", "report.build"],
      },
      {
        label: "Website",
        href: "/website",
        icon: "Globe",
        // Any-of. The enquiry inbox lives under Website but belongs to the
        // front desk and the registrar, who run admissions rather than the
        // site — and a child entry is locked whenever its parent is, so
        // gating this on website.read alone hid the inbox from the two
        // desks whose job it is.
        permissions: ["website.read", "website.enquiry.manage"],
        children: [
          { label: "Pages", href: "/website", icon: "FileText" },
          {
            label: "Media library",
            href: "/website/media",
            icon: "Image",
            permissions: ["website.manage"],
          },
          {
            label: "Enquiries",
            href: "/website/enquiries",
            icon: "MailQuestion",
            permissions: ["website.enquiry.manage"],
          },
        ],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: "Settings",
        permissions: ["settings.read"],
        children: [
          { label: "School profile", href: "/settings/school", icon: "Building2" },
          {
            label: "Dropdown options",
            href: "/settings/options",
            icon: "ListChecks",
            permissions: ["settings.option.manage"],
          },
          {
            label: "Custom fields",
            href: "/settings/custom-fields",
            icon: "SlidersHorizontal",
            permissions: ["settings.customfield.manage"],
          },
          {
            label: "Grading scales",
            href: "/settings/grading",
            icon: "Gauge",
            permissions: ["assessment.scale.manage"],
          },
          {
            label: "Integrations",
            href: "/settings/integrations",
            icon: "Plug",
            permissions: ["settings.integration.manage"],
          },
        ],
      },
      {
        label: "Users & Roles",
        href: "/users",
        icon: "ShieldCheck",
        permissions: ["user.read", "user.role.manage"],
      },
      {
        label: "Audit Trail",
        href: "/audit",
        icon: "History",
        permissions: ["user.audit.read"],
      },
    ],
  },
];

export const GUARDIAN_NAVIGATION: NavGroup[] = [
  {
    label: "My Family",
    items: [
      { label: "Overview", href: "/portal/guardian", icon: "Home" },
      { label: "Children", href: "/portal/guardian/children", icon: "GraduationCap" },
      { label: "Results", href: "/portal/guardian/results", icon: "FileText" },
      { label: "Attendance", href: "/portal/guardian/attendance", icon: "CalendarCheck" },
      {
        label: "Library Books",
        href: "/portal/guardian/library",
        icon: "Library",
        permissions: ["library.read"],
      },
      {
        label: "School Bus",
        href: "/portal/guardian/transport",
        icon: "Bus",
        permissions: ["transport.read"],
      },
    ],
  },
  {
    label: "Fees",
    items: [
      { label: "Fee Account", href: "/portal/guardian/fees", icon: "Wallet" },
      { label: "Payment History", href: "/portal/guardian/payments", icon: "Receipt" },
    ],
  },
  {
    label: "School",
    items: [
      { label: "Announcements", href: "/portal/guardian/announcements", icon: "Megaphone" },
      { label: "Messages", href: "/messages", icon: "MessageSquare" },
      {
        label: "Certificates",
        href: "/portal/guardian/credentials",
        icon: "Award",
      },
      { label: "Documents", href: "/portal/guardian/documents", icon: "FolderOpen" },
      { label: "Calendar", href: "/portal/guardian/calendar", icon: "Calendar" },
    ],
  },
];

export const STUDENT_NAVIGATION: NavGroup[] = [
  {
    label: "My Learning",
    items: [
      { label: "Overview", href: "/portal/student", icon: "Home" },
      { label: "My Courses", href: "/portal/student/courses", icon: "MonitorPlay" },
      { label: "Assignments", href: "/portal/student/assignments", icon: "ClipboardList" },
      { label: "Results", href: "/portal/student/results", icon: "FileText" },
      { label: "Certificates", href: "/portal/student/credentials", icon: "Award" },
      { label: "Timetable", href: "/portal/student/timetable", icon: "Calendar" },
      { label: "Attendance", href: "/portal/student/attendance", icon: "CalendarCheck" },
      {
        label: "My Library",
        href: "/portal/student/library",
        icon: "Library",
        permissions: ["library.read"],
      },
      {
        label: "My Bus",
        href: "/portal/student/transport",
        icon: "Bus",
        permissions: ["transport.read"],
      },
    ],
  },
  {
    label: "School Life",
    items: [
      { label: "Announcements", href: "/portal/student/announcements", icon: "Megaphone" },
      { label: "Elections", href: "/elections", icon: "Vote" },
      { label: "Messages", href: "/messages", icon: "MessageSquare" },
      { label: "Fees", href: "/portal/student/fees", icon: "Wallet" },
    ],
  },
];

export function navigationFor(portal: "STAFF" | "STUDENT" | "GUARDIAN"): NavGroup[] {
  switch (portal) {
    case "STUDENT":
      return STUDENT_NAVIGATION;
    case "GUARDIAN":
      return GUARDIAN_NAVIGATION;
    default:
      return STAFF_NAVIGATION;
  }
}
