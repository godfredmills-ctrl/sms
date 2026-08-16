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
  children?: Array<{
    label: string;
    href: string;
    /** Lucide icon name; submenu rows carry their own icon like the parents. */
    icon?: string;
    permissions?: string[];
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
        ],
      },
    ],
  },
  {
    label: "Academics",
    items: [
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
        label: "Courses (VLE)",
        href: "/lms",
        icon: "MonitorPlay",
        permissions: ["lms.course.read", "lms.course.manage"],
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
        permissions: ["website.read"],
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
            permissions: ["student.create"],
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
