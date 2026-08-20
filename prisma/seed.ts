/**
 * Seeds a complete, realistic demo school.
 *
 * Everything is deterministic (fixed PRNG seed) so re-running produces the
 * same school — useful for screenshots, demos and manual testing.
 *
 * Run with: npm run db:seed
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import sharp from "sharp";

import { hashPassword } from "../src/lib/crypto";
import { generateClassReportCards } from "../src/lib/grading";
import { computePayslip, parseAllowances } from "../src/lib/payroll";
import { PERMISSIONS, ROLE_PRESETS } from "../src/lib/rbac";
import { storeFile } from "../src/lib/storage";
import { starterLayout } from "../src/lib/templates";

const db = new PrismaClient();

// -----------------------------------------------------------------------------
// Deterministic randomness
// -----------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260815);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const chance = (probability: number) => random() < probability;

// -----------------------------------------------------------------------------
// Reference data
// -----------------------------------------------------------------------------

const MALE_NAMES = [
  "Kwame", "Kofi", "Yaw", "Kwabena", "Kwaku", "Kojo", "Kwasi", "Nana", "Elikem",
  "Selorm", "Mawuli", "Fiifi", "Ekow", "Kobby", "Jojo", "Papa", "Nii", "Tetteh",
  "Emmanuel", "Michael", "Daniel", "Samuel", "Joshua", "Isaac", "Kelvin", "Bright",
];

const FEMALE_NAMES = [
  "Akosua", "Ama", "Abena", "Akua", "Yaa", "Afua", "Adwoa", "Esi", "Efua",
  "Adjoa", "Maame", "Nana Ama", "Sedinam", "Elorm", "Dzifa", "Akorfa",
  "Grace", "Comfort", "Priscilla", "Naa", "Adobea", "Serwaa", "Abigail", "Linda",
];

const SURNAMES = [
  "Mensah", "Owusu", "Boateng", "Asante", "Agyemang", "Osei", "Appiah", "Frimpong",
  "Adjei", "Ansah", "Amoah", "Darko", "Kyei", "Nyarko", "Bediako", "Danso",
  "Quartey", "Lamptey", "Tetteh", "Nortey", "Ababio", "Sarpong", "Yeboah",
  "Addo", "Ofori", "Gyasi", "Antwi", "Bonsu", "Wiredu", "Acheampong",
];

const OTHER_NAMES = [
  "Kwabena", "Nana", "Kojo", "Yaw", "Akua", "Afia", "Selorm", "Enam",
  "Delali", "Kekeli", "Nii Ayi", "Naa Dei", "", "", "",
];

const REGIONS = [
  "Greater Accra", "Ashanti", "Central", "Eastern", "Western", "Volta",
  "Northern", "Bono", "Upper East",
];

const OCCUPATIONS = [
  "Trader", "Teacher", "Nurse", "Civil Servant", "Accountant", "Banker",
  "Engineer", "Doctor", "Lawyer", "Farmer", "Businesswoman", "Businessman",
  "Driver", "Seamstress", "Pharmacist", "IT Consultant", "Architect",
];

const PREVIOUS_SCHOOLS = [
  "Christ the King International School", "Ridge Church School",
  "Association International School", "Roman Ridge School",
  "Morning Star School", "Alpha Beta Christian College",
  "SOS Hermann Gmeiner International College", "North Ridge Lyceum",
];

const HOUSES = ["Kente", "Adinkra", "Sankofa", "Gye Nyame"];

const MOMO_PREFIXES = ["24", "54", "55", "59", "20", "50", "26", "27"];

function phone(): string {
  return `+233${pick(MOMO_PREFIXES)}${String(between(1000000, 9999999)).padStart(7, "0")}`;
}

function dateYearsAgo(years: number, jitterDays = 300): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() - between(0, jitterDays));
  return date;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  console.log("Seeding the demo school…\n");

  await assertDatabaseReachable();

  // Boot-time seeding must never destroy data. When this flag is set the seed
  // runs only against a database with no users, and otherwise exits cleanly.
  if (process.env.SEED_ONLY_IF_EMPTY === "true") {
    const existing = await db.user.count();
    if (existing > 0) {
      console.log(
        `  Database already has ${existing} user${existing === 1 ? "" : "s"} — leaving it untouched.\n`,
      );
      return;
    }
    console.log("  Database is empty; proceeding.\n");
  }

  await reset();

  const school = await seedSchool();
  const { year, terms } = await seedCalendar(school.id);
  const { roles } = await seedAccessControl();
  await seedOptionSets();
  await seedCustomFields();
  const gradeScale = await seedGrading();
  const { levels, sections } = await seedClasses();
  const subjects = await seedSubjects(levels);
  const staff = await seedStaff(roles, school.id);
  const offerings = await seedOfferings(year.id, terms, sections, subjects, staff);
  const { students, demoStudentSectionId } = await seedStudents(
    school.id,
    roles,
    sections,
    year.id,
  );
  await seedAssessments(offerings, terms, students, sections);
  await seedAttendance(terms, sections, students, staff);
  const feeCategories = await seedFeeStructures(year.id, terms, levels);
  await seedBilling(year.id, terms, students, feeCategories);
  await seedCommunications(roles);
  await seedElections(sections);
  await seedDocuments();
  await seedDocumentTemplates();
  await seedLearning(offerings, students, sections, demoStudentSectionId);
  await seedQuestionBank(subjects);
  await seedLibrary(subjects, students, staff);
  await seedTransport(students, staff);
  await seedReportCards(terms, sections, demoStudentSectionId);
  await seedWebsite(school);
  await seedPayroll(staff);

  console.log("\nDone.\n");
  await printCredentials();
}

/**
 * Fails fast on an unreachable database.
 *
 * Without this, `reset()` below swallows the connection error once per table
 * and the script appears to hang instead of telling you the URL is wrong.
 */
async function assertDatabaseReachable() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error(
      [
        "",
        "Could not reach the database.",
        "",
        `  DATABASE_URL = ${process.env.DATABASE_URL ?? "(not set)"}`,
        "",
        "Check that the database is running and the URL in .env is correct,",
        "then run `npm run db:migrate` before seeding.",
        "",
        `  ${(error as Error).message.split("\n")[0]}`,
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}

/** Wipes the demo data so the seed is re-runnable. */
async function reset() {
  console.log("  Clearing existing data…");
  // Ordered so foreign keys never block a delete.
  const tables: Array<keyof PrismaClient> = [
    "vote", "ballot", "voterRoll", "candidate", "electionPosition", "election",
    "quizAnswer", "quizAttempt", "quizOption", "quizQuestion", "quiz",
    "submissionFile", "submission", "assignment", "lessonProgress",
    "lessonResource", "lesson", "courseModule", "discussionPost",
    "discussionThread", "liveSession", "course",
    "communicationRecipient", "communicationJob", "feeReminder", "reminderRule",
    // After the two tables that point at it (communicationJob, reminderRule).
    "messageTemplate",
    "announcementRead", "announcementAttachment", "announcement",
    "memoRecipient", "memoAttachment", "memo",
    "directMessage", "conversationMember", "conversation",
    "notification", "pushSubscription", "notificationPreference",
    "paymentAllocation", "payment", "installment", "paymentPlan",
    "invoiceLine", "invoice", "studentDiscount",
    "feeStructureItem", "feeStructure", "feeCategory",
    "reportCardLine", "reportCard", "transcriptLine", "transcript",
    "issuedCertificate", "documentTemplate",
    "assessmentScore", "assessment",
    "attendanceRecord", "attendanceSession",
    "timetableSlot", "subjectOffering", "levelSubject",
    "promotionRecord", "enrollment",
    "clinicVisit", "studentMedical", "disciplinaryRecord",
    // Loans before copies before titles, and all three before the pupils,
    // staff and subjects they point at.
    "libraryLoan", "libraryCopy", "libraryItem",
    // Assignments before the stops and routes they point at, vehicles before
    // their route, and all four before the pupils and staff.
    "transportAssignment", "transportVehicle", "transportStop", "transportRoute",
    // Documents on a person's file — before the people and the files they
    // point at, both of which are deleted further down.
    "studentDocument", "staffDocument", "guardianDocument",
    "educationHistory", "familyRelation", "studentGuardian",
    "documentAccessLog", "documentVersion", "document", "documentFolder",
    "siteFormSubmission", "sitePost", "siteMedia", "siteMenu", "sitePage", "site",
    "reportRun", "reportDefinition", "aiInsight", "dataJob",
    "customFieldValue", "customFieldDef", "optionItem", "optionSet",
    "gradeBand", "gradeScale", "calendarEvent",
    "payslip", "payrollRun",
    "visitor",
    "staffLeave", "student", "guardian", "staff",
    "classSection", "classLevel", "subject",
    "auditLog", "session", "verificationToken",
    "userRole", "rolePermission", "role", "permission", "user",
    "fileAsset", "term", "academicYear", "setting", "campus", "school",
  ];

  // A model missing from the list above is not a harmless omission: its rows
  // survive the wipe and the seed dies hundreds of lines later on a unique
  // constraint that names a field rather than the cause. Catching it here
  // points straight at the fix.
  const known = new Set(tables as string[]);
  const delegates = db as unknown as Record<string, { deleteMany?: unknown }>;
  const missing = Object.keys(db).filter(
    (key) =>
      !key.startsWith("$") &&
      !key.startsWith("_") &&
      typeof delegates[key]?.deleteMany === "function" &&
      !known.has(key),
  );

  if (missing.length) {
    console.error(
      [
        "",
        `  ! ${missing.length} table(s) are not cleared by reset():`,
        ...missing.map((name) => `      ${name}`),
        "",
        "    Add them to the list in reset(), after anything that references them.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  for (const table of tables) {
    const model = db[table] as unknown as { deleteMany?: () => Promise<unknown> };
    if (typeof model?.deleteMany !== "function") continue;

    try {
      await model.deleteMany();
    } catch (error) {
      // Previously swallowed. A delete that fails here means the ordering is
      // wrong, and hiding it just moves the failure somewhere less explicable.
      console.error(
        `\n  ! Could not clear "${String(table)}": ${(error as Error).message.split("\n").find((line) => line.trim()) ?? ""}`,
      );
      console.error("    It is probably listed before a table that references it.\n");
      process.exit(1);
    }
  }
}

// -----------------------------------------------------------------------------

async function seedSchool() {
  console.log("  School profile…");

  const school = await db.school.create({
    data: {
      name: "Golden Crest International School",
      shortName: "Golden Crest",
      motto: "Knowledge, Character, Service",
      email: "info@goldencrest.edu.gh",
      phone: "+233302123456",
      website: "https://goldencrest.edu.gh",
      addressLine1: "12 Independence Avenue",
      city: "Accra",
      region: "Greater Accra",
      digitalAddr: "GA-183-4567",
      postalBox: "P.O. Box CT 1234, Cantonments",
      currency: "GHS",
      academicModel: "TERM",
      curricula: ["GES", "British (IGCSE)", "IB Diploma"],
      registrationNo: "GES/PRI/2011/0456",
      branding: { primary: "#128257", accent: "#d9a325" },
      campuses: {
        create: [
          {
            name: "Main Campus",
            code: "MAIN",
            isMain: true,
            address: "12 Independence Avenue, Accra",
          },
          {
            name: "Early Years Campus",
            code: "EY",
            address: "8 Liberation Road, Accra",
          },
        ],
      },
    },
    include: { campuses: true },
  });

  await db.setting.createMany({
    data: [
      { group: "finance", key: "invoice.terms", value: "Fees are payable in full before the mid-term break. Part payments are accepted." },
      { group: "finance", key: "late.grace.days", value: 7 },
      { group: "academic", key: "ca.weight", value: 40 },
      { group: "academic", key: "exam.weight", value: 60 },
      { group: "messaging", key: "quiet.hours", value: { from: 20, to: 7 } },
    ],
  });

  return school;
}

async function seedCalendar(schoolId: string) {
  console.log("  Academic year and terms…");

  // Terms are anchored to today so the current one always brackets it.
  //
  // The previous rule picked a September-to-July year from the calendar month,
  // which is correct for a real school and wrong for a demo: seed during the
  // long vacation — July or August — and you got a school whose academic year
  // finished last month. Every "current term" figure was historical, the
  // parent calendar counted down to a date four months past, and the whole
  // school read as abandoned.
  //
  // Being mid-term matters more than matching the Ghanaian calendar exactly:
  // marks and registers need to sit in the past, and the term needs to end in
  // the future, whenever the seed happens to run.
  const today = new Date();

  const term2Start = addDays(today, -45);
  const term2End = addDays(today, 40);
  const term1Start = addDays(term2Start, -140);
  const term1End = addDays(term2Start, -21);
  const term3Start = addDays(term2End, 17);
  const term3End = addDays(term2End, 110);

  const startYear = term1Start.getFullYear();

  const year = await db.academicYear.create({
    data: {
      schoolId,
      name: `${startYear}/${startYear + 1}`,
      startDate: term1Start,
      endDate: term3End,
      isCurrent: true,
      terms: {
        create: [
          {
            name: "Term 1",
            sequence: 1,
            startDate: term1Start,
            endDate: term1End,
            resultsDueDate: addDays(term1End, -7),
          },
          {
            name: "Term 2",
            sequence: 2,
            startDate: term2Start,
            endDate: term2End,
            resultsDueDate: addDays(term2End, -7),
            isCurrent: true,
          },
          {
            name: "Term 3",
            sequence: 3,
            startDate: term3Start,
            endDate: term3End,
            resultsDueDate: addDays(term3End, -7),
          },
        ],
      },
    },
    include: { terms: { orderBy: { sequence: "asc" } } },
  });

  await db.calendarEvent.createMany({
    data: [
      {
        academicYearId: year.id,
        title: "Mid-term break",
        category: "HOLIDAY",
        isHoliday: true,
        startsAt: addDays(new Date(), 12),
        endsAt: addDays(new Date(), 16),
      },
      {
        academicYearId: year.id,
        title: "PTA General Meeting",
        category: "PTA",
        startsAt: addDays(new Date(), 5),
        endsAt: addDays(new Date(), 5),
        location: "School Assembly Hall",
        audiences: ["STAFF", "GUARDIAN"],
      },
      {
        academicYearId: year.id,
        title: "Inter-House Athletics",
        category: "SPORTS",
        startsAt: addDays(new Date(), 21),
        endsAt: addDays(new Date(), 22),
        location: "School Field",
      },
      {
        academicYearId: year.id,
        title: "End of Term Examinations begin",
        category: "EXAM",
        startsAt: addDays(new Date(), 30),
        endsAt: addDays(new Date(), 40),
      },
      {
        academicYearId: year.id,
        title: "SRC Elections",
        category: "GENERAL",
        startsAt: addDays(new Date(), 9),
        endsAt: addDays(new Date(), 9),
        audiences: ["STAFF", "STUDENT"],
      },
    ],
  });

  return { year, terms: year.terms };
}

async function seedAccessControl() {
  console.log("  Permissions and roles…");

  await db.permission.createMany({
    data: PERMISSIONS.map((permission) => ({
      key: permission.key,
      module: permission.module,
      action: permission.action,
      description: permission.description,
    })),
  });

  const allPermissions = await db.permission.findMany();
  const byKey = new Map(allPermissions.map((permission) => [permission.key, permission.id]));

  const roles: Record<string, string> = {};

  for (const preset of ROLE_PRESETS) {
    const keys =
      preset.permissions === "*"
        ? allPermissions.map((permission) => permission.key)
        : preset.permissions;

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
    });

    roles[preset.key] = role.id;
  }

  return { roles };
}

async function seedOptionSets() {
  console.log("  Customisable dropdowns…");

  const sets: Array<{
    key: string;
    label: string;
    entity?: "STUDENT" | "STAFF" | "GUARDIAN";
    items: string[];
  }> = [
    { key: "student.house", label: "House", entity: "STUDENT", items: HOUSES },
    {
      key: "student.religion",
      label: "Religion",
      entity: "STUDENT",
      items: ["Christianity", "Islam", "Traditional", "Other", "None"],
    },
    {
      key: "student.transport",
      label: "Transport Mode",
      entity: "STUDENT",
      items: ["School Bus", "Private Car", "Walking", "Trotro", "Taxi", "Bicycle"],
    },
    {
      key: "student.living_with",
      label: "Living With",
      entity: "STUDENT",
      items: ["Both Parents", "Mother", "Father", "Guardian", "Relative", "Boarding"],
    },
    {
      key: "student.learning_support",
      label: "Learning Support Need",
      entity: "STUDENT",
      items: ["Dyslexia", "ADHD", "Speech & Language", "Visual Impairment", "Hearing Impairment", "Autism Spectrum"],
    },
    {
      key: "staff.department",
      label: "Department",
      entity: "STAFF",
      items: ["Mathematics", "Science", "Languages", "Humanities", "Creative Arts", "ICT", "Physical Education", "Administration", "Finance", "Health"],
    },
    {
      key: "staff.qualification",
      label: "Qualification",
      entity: "STAFF",
      items: ["Diploma in Education", "B.Ed", "B.Sc", "B.A", "M.Ed", "M.Sc", "MBA", "PhD"],
    },
    {
      key: "guardian.income_band",
      label: "Income Band",
      entity: "GUARDIAN",
      items: ["Below GH₵2,000", "GH₵2,000 – 5,000", "GH₵5,000 – 10,000", "Above GH₵10,000", "Prefer not to say"],
    },
    {
      key: "document.category",
      label: "Document Category",
      items: ["Policy", "Circular", "Minutes", "Report", "Contract", "Licence", "Curriculum", "Financial"],
    },
    {
      key: "discipline.category",
      label: "Disciplinary Category",
      items: ["Lateness", "Uniform", "Bullying", "Truancy", "Property Damage", "Academic Dishonesty", "Disrespect"],
    },
  ];

  for (const set of sets) {
    await db.optionSet.create({
      data: {
        key: set.key,
        label: set.label,
        entity: set.entity,
        isSystem: true,
        items: {
          create: set.items.map((label, index) => ({
            value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
            label,
            sortKey: index,
            isDefault: index === 0,
          })),
        },
      },
    });
  }
}

async function seedCustomFields() {
  console.log("  Custom fields…");

  await db.customFieldDef.createMany({
    data: [
      {
        entity: "STUDENT",
        key: "bus_stop",
        label: "Bus Stop",
        type: "TEXT",
        section: "Transport",
        helpText: "Where the school bus collects this student.",
        sortKey: 1,
      },
      {
        entity: "STUDENT",
        key: "swims",
        label: "Can swim",
        type: "BOOLEAN",
        section: "Additional Information",
        sortKey: 2,
      },
      {
        entity: "STUDENT",
        key: "club",
        label: "Co-curricular Club",
        type: "SELECT",
        section: "Additional Information",
        showInList: true,
        sortKey: 3,
      },
      {
        entity: "STUDENT",
        key: "photo_consent",
        label: "Photography consent",
        type: "BOOLEAN",
        section: "Consents",
        helpText: "May the school use this student's image in publicity?",
        sortKey: 4,
      },
      {
        entity: "STAFF",
        key: "teaching_licence",
        label: "GES Teaching Licence No.",
        type: "TEXT",
        section: "Professional",
        sortKey: 1,
      },
      {
        entity: "GUARDIAN",
        key: "preferred_contact_time",
        label: "Best time to call",
        type: "SELECT",
        section: "Contact Preferences",
        sortKey: 1,
      },
    ],
  });
}

async function seedGrading() {
  console.log("  Grading scales…");

  const wassce = await db.gradeScale.create({
    data: {
      name: "WASSCE Standard",
      code: "WASSCE",
      description: "Nine-point scale used for JHS and SHS.",
      isDefault: true,
      maxPoint: 9,
      bands: {
        create: [
          { grade: "A1", minScore: 80, maxScore: 100, point: 1, remark: "Excellent", colour: "#12805c", sortKey: 1 },
          { grade: "B2", minScore: 75, maxScore: 79.99, point: 2, remark: "Very Good", colour: "#1fa16d", sortKey: 2 },
          { grade: "B3", minScore: 70, maxScore: 74.99, point: 3, remark: "Good", colour: "#43bd88", sortKey: 3 },
          { grade: "C4", minScore: 65, maxScore: 69.99, point: 4, remark: "Credit", colour: "#78d8ab", sortKey: 4 },
          { grade: "C5", minScore: 60, maxScore: 64.99, point: 5, remark: "Credit", colour: "#aeeaca", sortKey: 5 },
          { grade: "C6", minScore: 55, maxScore: 59.99, point: 6, remark: "Credit", colour: "#f5d17c", sortKey: 6 },
          { grade: "D7", minScore: 50, maxScore: 54.99, point: 7, remark: "Pass", colour: "#eda100", sortKey: 7 },
          { grade: "E8", minScore: 45, maxScore: 49.99, point: 8, remark: "Weak Pass", colour: "#eb6834", sortKey: 8 },
          { grade: "F9", minScore: 0, maxScore: 44.99, point: 9, remark: "Fail", colour: "#c02626", isPass: false, sortKey: 9 },
        ],
      },
    },
  });

  await db.gradeScale.create({
    data: {
      name: "Primary (A–E)",
      code: "PRIMARY",
      description: "Five-band scale for lower and upper primary.",
      maxPoint: 5,
      bands: {
        create: [
          { grade: "A", minScore: 80, maxScore: 100, point: 1, remark: "Outstanding", sortKey: 1 },
          { grade: "B", minScore: 70, maxScore: 79.99, point: 2, remark: "Very Good", sortKey: 2 },
          { grade: "C", minScore: 60, maxScore: 69.99, point: 3, remark: "Good", sortKey: 3 },
          { grade: "D", minScore: 50, maxScore: 59.99, point: 4, remark: "Developing", sortKey: 4 },
          { grade: "E", minScore: 0, maxScore: 49.99, point: 5, remark: "Needs Support", isPass: false, sortKey: 5 },
        ],
      },
    },
  });

  await db.gradeScale.create({
    data: {
      name: "IGCSE",
      code: "IGCSE",
      description: "Cambridge IGCSE 9–1 scale.",
      maxPoint: 9,
      bands: {
        create: [
          { grade: "9", minScore: 90, maxScore: 100, point: 9, remark: "Exceptional", sortKey: 1 },
          { grade: "8", minScore: 82, maxScore: 89.99, point: 8, remark: "Excellent", sortKey: 2 },
          { grade: "7", minScore: 75, maxScore: 81.99, point: 7, remark: "Very Good", sortKey: 3 },
          { grade: "6", minScore: 68, maxScore: 74.99, point: 6, remark: "Good", sortKey: 4 },
          { grade: "5", minScore: 60, maxScore: 67.99, point: 5, remark: "Strong Pass", sortKey: 5 },
          { grade: "4", minScore: 50, maxScore: 59.99, point: 4, remark: "Standard Pass", sortKey: 6 },
          { grade: "3", minScore: 40, maxScore: 49.99, point: 3, remark: "Below Standard", isPass: false, sortKey: 7 },
          { grade: "2", minScore: 30, maxScore: 39.99, point: 2, remark: "Weak", isPass: false, sortKey: 8 },
          { grade: "1", minScore: 0, maxScore: 29.99, point: 1, remark: "Very Weak", isPass: false, sortKey: 9 },
        ],
      },
    },
  });

  return wassce;
}

async function seedClasses() {
  console.log("  Class levels and sections…");

  const definitions = [
    { name: "Nursery 1", code: "N1", stage: "NURSERY", sections: ["A"] },
    { name: "Nursery 2", code: "N2", stage: "NURSERY", sections: ["A"] },
    { name: "KG 1", code: "KG1", stage: "KINDERGARTEN", sections: ["A", "B"] },
    { name: "KG 2", code: "KG2", stage: "KINDERGARTEN", sections: ["A", "B"] },
    { name: "Basic 1", code: "B1", stage: "PRIMARY", sections: ["A", "B"] },
    { name: "Basic 2", code: "B2", stage: "PRIMARY", sections: ["A", "B"] },
    { name: "Basic 3", code: "B3", stage: "PRIMARY", sections: ["A", "B"] },
    { name: "Basic 4", code: "B4", stage: "PRIMARY", sections: ["A", "B"] },
    { name: "Basic 5", code: "B5", stage: "PRIMARY", sections: ["A"] },
    { name: "Basic 6", code: "B6", stage: "PRIMARY", sections: ["A"] },
    { name: "JHS 1", code: "J1", stage: "JHS", sections: ["A", "B"] },
    { name: "JHS 2", code: "J2", stage: "JHS", sections: ["A", "B"] },
    { name: "JHS 3", code: "J3", stage: "JHS", sections: ["A"] },
  ];

  const levels = [];
  const sections = [];

  for (const [index, definition] of definitions.entries()) {
    const level = await db.classLevel.create({
      data: {
        name: definition.name,
        code: definition.code,
        sequence: index + 1,
        stage: definition.stage,
        curriculum: definition.stage === "JHS" ? "GES" : "British",
      },
    });
    levels.push(level);

    for (const suffix of definition.sections) {
      const section = await db.classSection.create({
        data: {
          classLevelId: level.id,
          // Just the stream, not the level code. The app renders a class as
          // "{level} {section}" everywhere — report cards, registers, the
          // gradebook — so baking the code in here produced "JHS 3 J3A".
          // The academics form says as much: its placeholder is "Gold".
          name: suffix,
          code: `${definition.code}-${suffix}`,
          capacity: 30,
          roomName: `Room ${definition.code}${suffix}`,
        },
      });
      sections.push(section);
    }
  }

  return { levels, sections };
}

type LevelRow = Awaited<ReturnType<typeof seedClasses>>["levels"][number];
type SectionRow = Awaited<ReturnType<typeof seedClasses>>["sections"][number];

async function seedSubjects(levels: LevelRow[]) {
  console.log("  Subjects…");

  const definitions = [
    { name: "English Language", code: "ENG", department: "Languages", isCore: true },
    { name: "Mathematics", code: "MATH", department: "Mathematics", isCore: true },
    { name: "Integrated Science", code: "SCI", department: "Science", isCore: true },
    { name: "Social Studies", code: "SOC", department: "Humanities", isCore: true },
    { name: "Computing / ICT", code: "ICT", department: "ICT" },
    { name: "Religious & Moral Education", code: "RME", department: "Humanities" },
    { name: "Ghanaian Language (Twi)", code: "TWI", department: "Languages" },
    { name: "French", code: "FRE", department: "Languages", isElective: true },
    { name: "Creative Arts", code: "ART", department: "Creative Arts" },
    { name: "Physical Education", code: "PE", department: "Physical Education", excludeFromAggregate: true },
    { name: "Career Technology", code: "CT", department: "ICT" },
  ];

  const subjects = [];
  for (const [index, definition] of definitions.entries()) {
    const subject = await db.subject.create({
      data: { ...definition, sortKey: index, creditHours: 1 },
    });
    subjects.push(subject);
  }

  // Curriculum map: everything at JHS, a lighter set lower down.
  const lowerSubjects = subjects.filter((subject) =>
    ["ENG", "MATH", "SCI", "ART", "PE", "RME"].includes(subject.code),
  );

  for (const level of levels) {
    const applicable = level.stage === "JHS" ? subjects : lowerSubjects;
    await db.levelSubject.createMany({
      data: applicable.map((subject) => ({
        classLevelId: level.id,
        subjectId: subject.id,
        isCompulsory: !subject.isElective,
        periodsPerWeek: subject.isCore ? 5 : 2,
      })),
    });
  }

  return subjects;
}

type SubjectRow = Awaited<ReturnType<typeof seedSubjects>>[number];

/**
 * Monthly basic salary in pesewas, by role. Realistic Ghanaian private-school
 * figures so the payroll screens show something a bursar recognises.
 */
const SALARY_BY_ROLE: Record<string, number> = {
  super_admin: 650000,
  head_teacher: 850000,
  assistant_head: 620000,
  bursar: 550000,
  registrar: 380000,
  form_teacher: 320000,
  teacher: 280000,
  nurse: 260000,
  librarian: 220000,
  front_desk: 190000,
};

async function seedStaff(roles: Record<string, string>, schoolId: string) {
  console.log("  Staff and user accounts…");

  const campus = await db.campus.findFirst({ where: { schoolId, isMain: true } });
  const password = await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!");

  const definitions = [
    { first: "Kofi", last: "Mensah", title: "Mr", role: "super_admin", job: "System Administrator", dept: "Administration", teaching: false, email: process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu.gh" },
    { first: "Abena", last: "Owusu", title: "Mrs", role: "head_teacher", job: "Head Teacher", dept: "Administration", teaching: false, email: "head@goldencrest.edu.gh" },
    { first: "Samuel", last: "Boateng", title: "Mr", role: "assistant_head", job: "Assistant Head (Academics)", dept: "Administration", teaching: true, email: "assistanthead@goldencrest.edu.gh" },
    { first: "Grace", last: "Asante", title: "Ms", role: "bursar", job: "Bursar", dept: "Finance", teaching: false, email: "bursar@goldencrest.edu.gh" },
    { first: "Yaw", last: "Agyemang", title: "Mr", role: "registrar", job: "Registrar", dept: "Administration", teaching: false, email: "registrar@goldencrest.edu.gh" },
    { first: "Esi", last: "Appiah", title: "Mrs", role: "form_teacher", job: "Form Teacher — JHS 2A", dept: "Mathematics", teaching: true, email: "teacher@goldencrest.edu.gh" },
    { first: "Emmanuel", last: "Frimpong", title: "Mr", role: "teacher", job: "Teacher of Science", dept: "Science", teaching: true, email: "e.frimpong@goldencrest.edu.gh" },
    { first: "Adwoa", last: "Adjei", title: "Ms", role: "teacher", job: "Teacher of English", dept: "Languages", teaching: true, email: "a.adjei@goldencrest.edu.gh" },
    { first: "Michael", last: "Ansah", title: "Mr", role: "teacher", job: "Teacher of ICT", dept: "ICT", teaching: true, email: "m.ansah@goldencrest.edu.gh" },
    { first: "Comfort", last: "Amoah", title: "Mrs", role: "teacher", job: "Teacher of Social Studies", dept: "Humanities", teaching: true, email: "c.amoah@goldencrest.edu.gh" },
    { first: "Priscilla", last: "Darko", title: "Ms", role: "nurse", job: "School Nurse", dept: "Health", teaching: false, email: "nurse@goldencrest.edu.gh" },
    { first: "Daniel", last: "Kyei", title: "Mr", role: "librarian", job: "Librarian", dept: "Administration", teaching: false, email: "library@goldencrest.edu.gh" },
    { first: "Linda", last: "Nyarko", title: "Ms", role: "front_desk", job: "School Secretary", dept: "Administration", teaching: false, email: "frontdesk@goldencrest.edu.gh" },
  ];

  const staff = [];

  for (const [index, definition] of definitions.entries()) {
    const user = await db.user.create({
      data: {
        email: definition.email,
        phone: phone(),
        username: definition.email.split("@")[0],
        passwordHash: password,
        status: "ACTIVE",
        firstName: definition.first,
        lastName: definition.last,
        portal: "STAFF",
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roles[definition.role] } },
      },
    });

    const record = await db.staff.create({
      data: {
        userId: user.id,
        campusId: campus?.id,
        staffNo: `GCS/STF/${String(index + 1).padStart(3, "0")}`,
        title: definition.title,
        firstName: definition.first,
        lastName: definition.last,
        gender: ["Mrs", "Ms"].includes(definition.title) ? "FEMALE" : "MALE",
        dateOfBirth: dateYearsAgo(between(28, 55)),
        email: definition.email,
        phone: user.phone,
        nationality: "Ghanaian",
        jobTitle: definition.job,
        department: definition.dept,
        employmentType: "FULL_TIME",
        status: "ACTIVE",
        hireDate: dateYearsAgo(between(1, 12)),
        isTeaching: definition.teaching,
        qualifications: [
          { qualification: pick(["B.Ed", "B.Sc", "M.Ed", "B.A"]), institution: pick(["University of Ghana", "KNUST", "University of Cape Coast", "UEW"]), year: 2000 + between(5, 20) },
        ],
        // Salary by seniority, deterministic — no RNG, so re-seeding gives
        // the same payroll every time.
        basicSalaryMinor: SALARY_BY_ROLE[definition.role] ?? 180000,
        salaryAllowances:
          definition.role === "teacher" || definition.role === "form_teacher"
            ? [
                { name: "Transport", amountMinor: 25000 },
                { name: "Teaching allowance", amountMinor: 20000 },
              ]
            : [{ name: "Transport", amountMinor: 30000 }],
        momoNumber: user.phone,
        momoNetwork: "MTN",
        emergencyName: `${pick(MALE_NAMES)} ${pick(SURNAMES)}`,
        emergencyPhone: phone(),
        emergencyRelation: pick(["Spouse", "Sibling", "Parent"]),
      },
    });

    staff.push({ ...record, roleKey: definition.role });
  }

  return staff;
}

type StaffRow = Awaited<ReturnType<typeof seedStaff>>[number];
type TermRow = { id: string; name: string; sequence: number; startDate: Date; endDate: Date };

async function seedOfferings(
  academicYearId: string,
  terms: TermRow[],
  sections: SectionRow[],
  subjects: SubjectRow[],
  staff: StaffRow[],
) {
  console.log("  Subject offerings and timetable…");

  const teachers = staff.filter((member) => member.isTeaching);
  const currentTerm = terms.find((term) => term.sequence === 2) ?? terms[0];

  // Assign form teachers round-robin.
  for (const [index, section] of sections.entries()) {
    await db.classSection.update({
      where: { id: section.id },
      data: { formTeacherId: teachers[index % teachers.length].id },
    });
  }

  const offerings = [];

  for (const section of sections) {
    const levelSubjects = await db.levelSubject.findMany({
      where: { classLevelId: section.classLevelId },
      select: { subjectId: true },
    });

    for (const term of terms) {
      for (const [index, link] of levelSubjects.entries()) {
        const subject = subjects.find((entry) => entry.id === link.subjectId);
        if (!subject) continue;

        // Keep the same teacher on a subject across terms — realistic, and it
        // makes the teaching-effectiveness analytics meaningful.
        const teacher = teachers[(section.name.charCodeAt(0) + index) % teachers.length];

        const offering = await db.subjectOffering.create({
          data: {
            academicYearId,
            termId: term.id,
            subjectId: subject.id,
            classSectionId: section.id,
            teacherId: teacher.id,
            room: section.roomName,
          },
        });

        if (term.id === currentTerm.id) offerings.push(offering);
      }
    }
  }

  // A timetable for every class, not for the first sixty offerings.
  //
  // The slice was a rough cap on how much to generate, and it cut across
  // classes rather than within them: offerings come out grouped by section, so
  // sixty covered the first ten or so and left every class after that — all of
  // JHS — with an empty timetable. A blank timetable does not look like a
  // seeding limit to anyone; it looks like the module is broken.
  const periods = [
    { index: 1, start: "08:00", end: "08:40" },
    { index: 2, start: "08:40", end: "09:20" },
    { index: 3, start: "09:20", end: "10:00" },
    { index: 4, start: "10:20", end: "11:00" },
    { index: 5, start: "11:00", end: "11:40" },
  ];

  // Laid out per class so each one gets a spread of subjects across the week
  // rather than a random scattering that leaves gaps in some and clashes in
  // others. Walking the grid in order and taking the next subject each time
  // gives every class a full, conflict-free timetable.
  const bySection = new Map<string, typeof offerings>();
  for (const offering of offerings) {
    const list = bySection.get(offering.classSectionId) ?? [];
    list.push(offering);
    bySection.set(offering.classSectionId, list);
  }

  for (const [classSectionId, sectionOfferings] of bySection) {
    if (!sectionOfferings.length) continue;
    let cursor = 0;

    for (let day = 1; day <= 5; day += 1) {
      for (const period of periods) {
        const offering = sectionOfferings[cursor % sectionOfferings.length];
        cursor += 1;

        await db.timetableSlot
          .create({
            data: {
              classSectionId,
              offeringId: offering.id,
              dayOfWeek: day,
              periodIndex: period.index,
              startTime: period.start,
              endTime: period.end,
              room: offering.room,
            },
          })
          .catch(() => undefined); // Slot already taken — fine for demo data.
      }
    }
  }

  return offerings;
}

type OfferingRow = Awaited<ReturnType<typeof seedOfferings>>[number];

async function seedStudents(
  schoolId: string,
  roles: Record<string, string>,
  sections: SectionRow[],
  academicYearId: string,
) {
  console.log("  Students, guardians and family records…");

  const campus = await db.campus.findFirst({ where: { schoolId, isMain: true } });
  const password = await hashPassword("Student123!");
  const guardianPassword = await hashPassword("Parent123!");

  const students = [];
  let admissionCounter = 1;
  let demoGuardianCreated = false;
  let demoStudentCreated = false;

  for (const section of sections) {
    const classSize = between(14, 24);

    for (let index = 0; index < classSize; index += 1) {
      const isFemale = chance(0.5);
      const firstName = isFemale ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
      const lastName = pick(SURNAMES);
      const otherName = pick(OTHER_NAMES);
      const admissionNo = `GCS/${String(2020 + between(0, 5))}/${String(admissionCounter).padStart(4, "0")}`;
      admissionCounter += 1;

      // Age tracks the class level so the data reads correctly.
      const level = sections.indexOf(section);
      const age = 3 + Math.floor(level / 1.5) + between(0, 1);

      const isBoarder = chance(0.18);
      const hasSupport = chance(0.08);

      const student = await db.student.create({
        data: {
          campusId: campus?.id,
          admissionNo,
          firstName,
          lastName,
          otherNames: otherName || null,
          gender: isFemale ? "FEMALE" : "MALE",
          dateOfBirth: dateYearsAgo(age),
          placeOfBirth: pick(["Accra", "Kumasi", "Takoradi", "Tema", "Cape Coast"]),
          status: "ENROLLED",
          nationality: chance(0.9) ? "Ghanaian" : pick(["Nigerian", "Ivorian", "British", "Lebanese", "Indian"]),
          birthCertNo: `BC${between(100000, 999999)}`,
          nhisNumber: chance(0.6) ? String(between(10000000, 99999999)) : null,
          hometown: pick(["Kumasi", "Cape Coast", "Ho", "Koforidua", "Sunyani", "Tamale"]),
          homeRegion: pick(REGIONS),
          religion: chance(0.75) ? "Christianity" : pick(["Islam", "Traditional", "Other"]),
          firstLanguage: chance(0.5) ? "English" : pick(["Twi", "Ga", "Ewe", "Fante"]),
          otherLanguages: chance(0.4) ? ["Twi"] : [],
          residentialAddress: `House ${between(1, 90)}, ${pick(["East Legon", "Adenta", "Spintex", "Dansoman", "Achimota", "Madina", "Tema Community 5"])}`,
          digitalAddr: `GA-${between(100, 599)}-${between(1000, 9999)}`,
          city: "Accra",
          region: "Greater Accra",
          livingWith: isBoarder ? "BOARDING" : pick(["BOTH_PARENTS", "BOTH_PARENTS", "BOTH_PARENTS", "MOTHER", "FATHER", "GUARDIAN"]),
          householdSize: between(3, 8),
          numberOfSiblings: between(0, 4),
          birthOrder: between(1, 4),
          parentMaritalStatus: pick(["MARRIED", "MARRIED", "MARRIED", "SEPARATED", "WIDOWED", "SINGLE"]),
          isSingleParent: chance(0.15),
          onScholarship: chance(0.08),
          distanceToSchoolKm: Number((random() * 22 + 0.5).toFixed(1)),
          transportMode: isBoarder ? null : pick(["SCHOOL_BUS", "PRIVATE", "WALKING", "TROTRO", "TAXI"]),
          busRoute: chance(0.3) ? `Route ${between(1, 6)}` : null,
          internetAtHome: chance(0.7),
          deviceAccess: pick(["NONE", "SHARED", "OWN_PHONE", "OWN_LAPTOP"]),
          isBoarder,
          house: pick(HOUSES),
          dormitory: isBoarder ? pick(["Unity Hall", "Harmony Hall"]) : null,
          roomNumber: isBoarder ? `${between(1, 20)}` : null,
          hasSpecialNeeds: hasSupport,
          learningSupport: hasSupport ? [pick(["Dyslexia", "ADHD", "Speech & Language"])] : [],
          giftedTalented: chance(0.06) ? [pick(["Mathematics", "Music", "Athletics", "Debating"])] : [],
          admissionDate: dateYearsAgo(between(0, 4)),
          admissionType: chance(0.7) ? "NEW" : "TRANSFER",
          referralSource: pick(["Word of mouth", "Website", "Sibling", "Church", "Advertisement"]),
        },
      });

      // --- Medical --------------------------------------------------------
      const hasAllergy = chance(0.22);
      await db.studentMedical.create({
        data: {
          studentId: student.id,
          bloodGroup: pick(["O+", "O+", "A+", "B+", "AB+", "O-", "A-"]),
          genotype: pick(["AA", "AA", "AA", "AS", "AS", "SS"]),
          heightCm: 90 + age * 6 + between(-5, 5),
          weightKg: 14 + age * 3 + between(-3, 4),
          lastCheckup: addDays(new Date(), -between(30, 300)),
          allergies: hasAllergy
            ? [
                {
                  name: pick(["Peanuts", "Shellfish", "Dust", "Penicillin", "Pollen", "Eggs"]),
                  severity: pick(["MILD", "MODERATE", "SEVERE", "ANAPHYLAXIS"]),
                  reaction: pick(["Rash and itching", "Swelling of lips", "Difficulty breathing", "Stomach upset"]),
                  treatment: pick(["Antihistamine", "EpiPen — call ambulance", "Avoid exposure"]),
                },
              ]
            : [],
          conditions: chance(0.12)
            ? [
                {
                  condition: pick(["Asthma", "Sickle Cell", "Eczema", "Epilepsy"]),
                  diagnosedOn: dateYearsAgo(between(1, 6)).toISOString().slice(0, 10),
                  status: "Managed",
                  notes: "Reviewed annually by family doctor.",
                },
              ]
            : [],
          medications: chance(0.1)
            ? [
                {
                  name: "Salbutamol inhaler",
                  dosage: "2 puffs",
                  frequency: "As needed",
                  administerAtSchool: true,
                },
              ]
            : [],
          immunisations: [
            { vaccine: "BCG", date: "At birth" },
            { vaccine: "Measles-Rubella", date: dateYearsAgo(age - 1).toISOString().slice(0, 10) },
            { vaccine: "Yellow Fever", date: dateYearsAgo(age - 1).toISOString().slice(0, 10) },
          ],
          dietaryRestrictions: chance(0.12) ? pick(["No pork", "Vegetarian", "No dairy"]) : null,
          doctorName: `Dr. ${pick(SURNAMES)}`,
          doctorPhone: phone(),
          hospitalName: pick(["Korle Bu Teaching Hospital", "37 Military Hospital", "Nyaho Medical Centre", "Ridge Hospital"]),
          insuranceProvider: chance(0.5) ? pick(["NHIS", "Acacia Health", "GLICO Healthcare"]) : null,
          consentToTreat: chance(0.85),
          emergencyInstructions: hasAllergy
            ? "Administer antihistamine, call the parent immediately, and if breathing is affected use the EpiPen and call an ambulance."
            : null,
        },
      });

      if (chance(0.25)) {
        const medical = await db.studentMedical.findUnique({ where: { studentId: student.id } });
        if (medical) {
          await db.clinicVisit.create({
            data: {
              medicalId: medical.id,
              visitedAt: addDays(new Date(), -between(1, 60)),
              complaint: pick(["Headache", "Stomach ache", "Minor cut on knee", "Fever", "Toothache"]),
              temperature: Number((36 + random() * 2).toFixed(1)),
              treatment: pick(["Paracetamol administered", "Cleaned and dressed the wound", "Rested in sick bay"]),
              outcome: pick(["RETURNED_TO_CLASS", "RETURNED_TO_CLASS", "SENT_HOME"]),
              attendedBy: "Ms Priscilla Darko",
              guardianNotified: chance(0.6),
            },
          });
        }
      }

      // --- Guardians ------------------------------------------------------
      const fatherName = pick(MALE_NAMES);
      const motherName = pick(FEMALE_NAMES);
      const hasFather = !chance(0.12);
      const hasMother = !chance(0.06);

      const guardianLinks: Prisma.StudentGuardianCreateWithoutStudentInput[] = [];

      if (hasFather) {
        // Give exactly one family a known login so the parent portal is demoable.
        // Keyed on the section's unique code, not its display name — the name
        // is now just the stream letter and is shared across every level.
        const isDemo = !demoGuardianCreated && section.code === "J2-A" && index === 0;
        const guardianUser = isDemo
          ? await db.user.create({
              data: {
                email: "parent@goldencrest.edu.gh",
                phone: phone(),
                passwordHash: guardianPassword,
                status: "ACTIVE",
                firstName: fatherName,
                lastName,
                portal: "GUARDIAN",
                emailVerifiedAt: new Date(),
                roles: { create: { roleId: roles.guardian } },
              },
            })
          : chance(0.35)
            ? await db.user.create({
                data: {
                  phone: phone(),
                  passwordHash: guardianPassword,
                  status: "ACTIVE",
                  firstName: fatherName,
                  lastName,
                  portal: "GUARDIAN",
                  roles: { create: { roleId: roles.guardian } },
                },
              })
            : null;

        if (isDemo) demoGuardianCreated = true;

        const father = await db.guardian.create({
          data: {
            userId: guardianUser?.id,
            title: "Mr",
            firstName: fatherName,
            lastName,
            gender: "MALE",
            phone: guardianUser?.phone ?? phone(),
            email: isDemo ? "parent@goldencrest.edu.gh" : chance(0.6) ? `${fatherName.toLowerCase()}.${lastName.toLowerCase()}@example.com` : null,
            whatsapp: phone(),
            address: student.residentialAddress,
            digitalAddr: student.digitalAddr,
            city: "Accra",
            occupation: pick(OCCUPATIONS),
            employer: pick(["Self-employed", "Ghana Revenue Authority", "MTN Ghana", "Ecobank", "Ministry of Health", "Private practice"]),
            educationLevel: pick(["SHS", "Diploma", "Degree", "Postgraduate"]),
            incomeBand: pick(["GH₵2,000 – 5,000", "GH₵5,000 – 10,000", "Above GH₵10,000"]),
            preferredChannel: pick(["SMS", "SMS", "EMAIL", "PUSH"]),
            isPtaMember: chance(0.2),
          },
        });

        guardianLinks.push({
          guardian: { connect: { id: father.id } },
          relation: "FATHER",
          isPrimary: true,
          isEmergency: true,
          isBillPayer: true,
          billSharePercent: hasMother ? 60 : 100,
          hasCustody: true,
          canPickUp: true,
          receivesReports: true,
          livesWithStudent: !isBoarder,
          sortKey: 0,
        });
      }

      if (hasMother) {
        const mother = await db.guardian.create({
          data: {
            title: "Mrs",
            firstName: motherName,
            lastName,
            gender: "FEMALE",
            phone: phone(),
            email: chance(0.5) ? `${motherName.toLowerCase().replace(/\s+/g, "")}.${lastName.toLowerCase()}@example.com` : null,
            address: student.residentialAddress,
            city: "Accra",
            occupation: pick(OCCUPATIONS),
            educationLevel: pick(["SHS", "Diploma", "Degree", "Postgraduate"]),
            preferredChannel: "SMS",
            isPtaMember: chance(0.25),
          },
        });

        guardianLinks.push({
          guardian: { connect: { id: mother.id } },
          relation: "MOTHER",
          isPrimary: !hasFather,
          isEmergency: true,
          isBillPayer: !hasFather,
          billSharePercent: hasFather ? 40 : 100,
          hasCustody: true,
          canPickUp: true,
          receivesReports: true,
          livesWithStudent: !isBoarder,
          sortKey: 1,
        });
      }

      for (const link of guardianLinks) {
        await db.studentGuardian.create({
          data: { ...link, student: { connect: { id: student.id } } },
        });
      }

      // --- Family tree ----------------------------------------------------
      const relations: Prisma.FamilyRelationCreateManyInput[] = [];

      if (chance(0.7)) {
        relations.push({
          studentId: student.id,
          relation: "GRANDFATHER",
          generation: -2,
          lineage: "PATERNAL",
          fullName: `${pick(MALE_NAMES)} ${lastName}`,
          gender: "MALE",
          isDeceased: chance(0.4),
          occupation: pick(["Retired teacher", "Farmer", "Chief", "Retired civil servant"]),
        });
      }
      if (chance(0.6)) {
        relations.push({
          studentId: student.id,
          relation: "GRANDMOTHER",
          generation: -2,
          lineage: "MATERNAL",
          fullName: `${pick(FEMALE_NAMES)} ${pick(SURNAMES)}`,
          gender: "FEMALE",
          isDeceased: chance(0.35),
          occupation: pick(["Trader", "Retired nurse", "Homemaker"]),
        });
      }
      if (chance(0.45)) {
        relations.push({
          studentId: student.id,
          relation: chance(0.5) ? "UNCLE" : "AUNT",
          generation: -1,
          lineage: chance(0.5) ? "PATERNAL" : "MATERNAL",
          fullName: chance(0.5) ? `${pick(MALE_NAMES)} ${lastName}` : `${pick(FEMALE_NAMES)} ${pick(SURNAMES)}`,
          occupation: pick(OCCUPATIONS),
          phone: phone(),
          isAlumnus: chance(0.25),
        });
      }
      const siblingCount = between(0, 2);
      for (let s = 0; s < siblingCount; s += 1) {
        relations.push({
          studentId: student.id,
          relation: chance(0.5) ? "BROTHER" : "SISTER",
          generation: 0,
          fullName: `${chance(0.5) ? pick(MALE_NAMES) : pick(FEMALE_NAMES)} ${lastName}`,
          dateOfBirth: dateYearsAgo(age + between(-4, 4)),
        });
      }

      if (relations.length) {
        await db.familyRelation.createMany({ data: relations });
      }

      // --- Education history ----------------------------------------------
      if (chance(0.55)) {
        await db.educationHistory.create({
          data: {
            studentId: student.id,
            schoolName: pick(PREVIOUS_SCHOOLS),
            schoolType: pick(["PRIVATE", "INTERNATIONAL", "PUBLIC"]),
            country: "Ghana",
            city: "Accra",
            curriculum: pick(["GES", "British", "Montessori"]),
            levelFrom: "KG 1",
            levelTo: pick(["Basic 2", "Basic 3", "Basic 4"]),
            startDate: dateYearsAgo(age - 3),
            endDate: dateYearsAgo(between(1, 3)),
            reasonForLeaving: pick(["Relocation", "Seeking better facilities", "Parent transfer", "Fee considerations"]),
            lastAverage: Number((55 + random() * 35).toFixed(1)),
            lastPosition: `${between(1, 25)} of ${between(25, 40)}`,
            conduct: pick(["Excellent", "Very good", "Good"]),
            hasTranscript: chance(0.6),
            verified: chance(0.5),
          },
        });
      }

      // --- Discipline -------------------------------------------------------
      if (chance(0.12)) {
        await db.disciplinaryRecord.create({
          data: {
            studentId: student.id,
            incidentAt: addDays(new Date(), -between(5, 120)),
            category: pick(["LATENESS", "UNIFORM", "TRUANCY", "DISRESPECT"]),
            severity: pick(["MINOR", "MINOR", "MODERATE"]),
            description: pick([
              "Arrived after the second bell on three consecutive days.",
              "Out of correct uniform during morning assembly.",
              "Left the classroom without permission during a lesson.",
            ]),
            location: pick(["Assembly ground", "Classroom", "School gate"]),
            actionTaken: pick(["Verbal warning issued", "Parent contacted", "Break-time detention"]),
            sanction: pick(["WARNING", "DETENTION"]),
            reportedBy: "Form teacher",
            guardianNotified: chance(0.7),
            ...(chance(0.7)
              ? {
                  status: "RESOLVED",
                  resolution: pick([
                    "Detention served; no repeat since.",
                    "Apology made and accepted; parents informed.",
                    "Warning acknowledged in writing.",
                  ]),
                  handledBy: "Head of Section",
                }
              : { status: "OPEN" }),
          },
        });
      }

      // --- Enrolment and portal account ------------------------------------
      await db.enrollment.create({
        data: {
          studentId: student.id,
          classSectionId: section.id,
          academicYearId,
          status: "ACTIVE",
          rollNumber: index + 1,
        },
      });

      // Older students get a portal login. The `chance` call stays exactly
      // here, and is made for every student regardless: the demo account is
      // chosen in a second pass below, and moving or skipping this call would
      // shift the whole random sequence and rename every student after it.
      if (age >= 11 && chance(0.5)) {
        const studentUser = await db.user.create({
          data: {
            username: admissionNo.replace(/\//g, "").toLowerCase(),
            passwordHash: password,
            status: "ACTIVE",
            firstName,
            lastName,
            portal: "STUDENT",
            roles: { create: { roleId: roles.student } },
          },
        });
        await db.student.update({
          where: { id: student.id },
          data: { userId: studentUser.id },
        });
      }

      students.push({ ...student, sectionId: section.id });
    }
  }

  const demoStudent = await promoteDemoStudent(students, roles, password);

  console.log(`    ${students.length} students created`);
  return { students, demoStudentSectionId: demoStudent?.sectionId ?? null };
}

/**
 * Attaches the known demo login to one specific student.
 *
 * Done as a second pass rather than inline so the target can be named rather
 * than being "whichever student in J2A happened to win a coin flip". Set
 * SEED_DEMO_STUDENT to an admission number or a full name to change who it is;
 * the default is the student the school asked for.
 *
 * Falls back to any student with a login if the target is missing, so a
 * mistyped name degrades to a working demo account rather than to no login at
 * all.
 */
async function promoteDemoStudent(
  students: Array<{ id: string; admissionNo: string; firstName: string; lastName: string; sectionId: string }>,
  roles: Record<string, string>,
  password: string,
) {
  const wanted = (process.env.SEED_DEMO_STUDENT ?? "GCS/2024/0390").trim().toLowerCase();

  const normalise = (value: string) => value.trim().toLowerCase();

  const target =
    students.find((student) => normalise(student.admissionNo) === wanted) ??
    students.find(
      (student) => normalise(`${student.firstName} ${student.lastName}`) === wanted,
    ) ??
    null;

  if (!target) {
    console.warn(
      `    ! No student matches "${process.env.SEED_DEMO_STUDENT ?? "GCS/2024/0390"}" — the demo login will go to the first student who has one.`,
    );
  }

  const fallback = students.find((student) => student.id);
  const chosen = target ?? fallback;
  if (!chosen) return null;

  // Free the demo address and username in case a previous pass used them.
  await db.user.updateMany({
    where: { email: "student@goldencrest.edu.gh" },
    data: { email: null },
  });
  await db.user.updateMany({
    where: { username: "student" },
    data: { username: null },
  });

  const record = await db.student.findUnique({
    where: { id: chosen.id },
    select: { userId: true },
  });

  if (record?.userId) {
    await db.user.update({
      where: { id: record.userId },
      data: { email: "student@goldencrest.edu.gh", username: "student" },
    });
  } else {
    // The target did not draw a portal login in the main pass, so give them
    // one. No random calls here — the sequence is already spent.
    const studentUser = await db.user.create({
      data: {
        email: "student@goldencrest.edu.gh",
        username: "student",
        passwordHash: password,
        status: "ACTIVE",
        firstName: chosen.firstName,
        lastName: chosen.lastName,
        portal: "STUDENT",
        roles: { create: { roleId: roles.student } },
      },
    });
    await db.student.update({
      where: { id: chosen.id },
      data: { userId: studentUser.id },
    });
  }

  console.log(
    `    Demo student login → ${chosen.firstName} ${chosen.lastName} (${chosen.admissionNo})`,
  );

  return chosen;
}

type StudentRow = Awaited<ReturnType<typeof seedStudents>>["students"][number];

async function seedAssessments(
  offerings: OfferingRow[],
  terms: TermRow[],
  students: StudentRow[],
  sections: SectionRow[],
) {
  console.log("  Assessments and marks…");

  const currentTerm = terms.find((term) => term.sequence === 2) ?? terms[0];
  const studentsBySection = new Map<string, StudentRow[]>();
  for (const student of students) {
    studentsBySection.set(student.sectionId, [
      ...(studentsBySection.get(student.sectionId) ?? []),
      student,
    ]);
  }

  // Give each student a latent ability so their marks correlate across
  // subjects — otherwise every analysis sees pure noise.
  const ability = new Map<string, number>();
  for (const student of students) {
    ability.set(student.id, 55 + random() * 30);
  }

  const templates = [
    { title: "Class Test 1", category: "TEST" as const, weight: 10, max: 20, isExam: false, offsetDays: -45 },
    { title: "Homework Portfolio", category: "HOMEWORK" as const, weight: 10, max: 20, isExam: false, offsetDays: -30 },
    { title: "Group Project", category: "PROJECT" as const, weight: 10, max: 20, isExam: false, offsetDays: -20 },
    { title: "Class Test 2", category: "TEST" as const, weight: 10, max: 20, isExam: false, offsetDays: -10 },
    { title: "End of Term Examination", category: "EXAM" as const, weight: 60, max: 100, isExam: true, offsetDays: -2 },
  ];

  let scoreCount = 0;

  for (const offering of offerings) {
    const classStudents = studentsBySection.get(offering.classSectionId) ?? [];
    if (!classStudents.length) continue;

    // A per-offering difficulty makes some subjects visibly harder, which is
    // what the teaching-effectiveness analysis is meant to surface.
    const difficulty = random() * 16 - 8;

    for (const template of templates) {
      // The terminal exam has not happened in every class yet.
      if (template.isExam && chance(0.25)) continue;

      const assessment = await db.assessment.create({
        data: {
          offeringId: offering.id,
          termId: currentTerm.id,
          title: template.title,
          category: template.category,
          maxScore: template.max,
          weight: template.weight,
          isExam: template.isExam,
          conductedOn: addDays(new Date(), template.offsetDays),
          isPublished: true,
          publishedAt: addDays(new Date(), template.offsetDays + 2),
        },
      });

      const rows: Prisma.AssessmentScoreCreateManyInput[] = [];

      for (const student of classStudents) {
        const isAbsent = chance(0.03);
        const base = (ability.get(student.id) ?? 60) - difficulty + (random() * 16 - 8);
        const percent = Math.max(5, Math.min(99, base));

        rows.push({
          assessmentId: assessment.id,
          studentId: student.id,
          score: isAbsent ? null : Number(((percent / 100) * template.max).toFixed(1)),
          isAbsent,
          gradedById: offering.teacherId,
        });
      }

      await db.assessmentScore.createMany({ data: rows });
      scoreCount += rows.length;
    }
  }

  console.log(`    ${scoreCount} marks recorded`);
}

async function seedAttendance(
  terms: TermRow[],
  sections: SectionRow[],
  students: StudentRow[],
  staff: StaffRow[],
) {
  console.log("  Attendance registers…");

  const currentTerm = terms.find((term) => term.sequence === 2) ?? terms[0];
  const studentsBySection = new Map<string, StudentRow[]>();
  for (const student of students) {
    studentsBySection.set(student.sectionId, [
      ...(studentsBySection.get(student.sectionId) ?? []),
      student,
    ]);
  }

  // Some students are habitually absent — this is what the at-risk scan finds.
  const reliability = new Map<string, number>();
  for (const student of students) {
    reliability.set(student.id, chance(0.07) ? 0.62 + random() * 0.15 : 0.93 + random() * 0.07);
  }

  const teacher = staff.find((member) => member.isTeaching) ?? staff[0];
  let sessionCount = 0;

  // The last 25 school days.
  const days: Date[] = [];
  const cursor = new Date();
  while (days.length < 25) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  for (const section of sections) {
    const classStudents = studentsBySection.get(section.id) ?? [];
    if (!classStudents.length) continue;

    for (const day of days) {
      const session = await db.attendanceSession.create({
        data: {
          termId: currentTerm.id,
          classSectionId: section.id,
          date: new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())),
          type: "DAILY",
          takenById: section.formTeacherId ?? teacher.id,
          takenAt: day,
          isLocked: true,
        },
      });
      sessionCount += 1;

      await db.attendanceRecord.createMany({
        data: classStudents.map((student) => {
          const roll = random();
          const threshold = reliability.get(student.id) ?? 0.95;
          const status =
            roll < threshold
              ? "PRESENT"
              : roll < threshold + 0.04
                ? "LATE"
                : roll < threshold + 0.06
                  ? "EXCUSED"
                  : roll < threshold + 0.07
                    ? "SICK"
                    : "ABSENT";

          return {
            sessionId: session.id,
            studentId: student.id,
            status: status as "PRESENT",
            minutesLate: status === "LATE" ? between(5, 40) : null,
            reason: status === "SICK" ? "Reported unwell" : status === "EXCUSED" ? "Family commitment" : null,
          };
        }),
      });
    }
  }

  console.log(`    ${sessionCount} registers taken`);
}

async function seedFeeStructures(academicYearId: string, terms: TermRow[], levels: LevelRow[]) {
  console.log("  Fee categories and structures…");

  const categories = await Promise.all(
    [
      { name: "Tuition", code: "TUITION", sortKey: 1 },
      { name: "Admission Fee", code: "ADMISSION", isRecurring: false, sortKey: 2 },
      { name: "PTA Levy", code: "PTA", sortKey: 3 },
      { name: "Examination Fee", code: "EXAM", sortKey: 4 },
      { name: "Books & Stationery", code: "BOOKS", sortKey: 5 },
      { name: "ICT Levy", code: "ICT", sortKey: 6 },
      { name: "Boarding Fee", code: "BOARDING", isMandatory: false, sortKey: 7 },
      { name: "School Bus", code: "TRANSPORT", isOptional: true, isMandatory: false, sortKey: 8 },
      { name: "Feeding", code: "FEEDING", sortKey: 9 },
    ].map((category) => db.feeCategory.create({ data: category })),
  );

  const byCode = new Map(categories.map((category) => [category.code, category]));

  for (const term of terms) {
    for (const level of levels) {
      // Fees scale with the level — nursery is cheaper than JHS.
      const tier = Math.ceil(level.sequence / 4);
      const tuition = (900 + tier * 450) * 100;

      for (const boarderType of ["DAY", "BOARDER"] as const) {
        await db.feeStructure.create({
          data: {
            academicYearId,
            termId: term.id,
            classLevelId: level.id,
            name: `${level.name} — ${term.name} (${boarderType === "BOARDER" ? "Boarding" : "Day"})`,
            boarderType,
            studentType: "ALL",
            currency: "GHS",
            dueDate: addDays(term.startDate, 21),
            minimumFirstPaymentMinor: Math.round(tuition * 0.5),
            isPublished: true,
            notes: "Part payments accepted. At least 50% is due before mid-term.",
            items: {
              create: [
                { categoryId: byCode.get("TUITION")!.id, amountMinor: tuition, sortKey: 1 },
                { categoryId: byCode.get("PTA")!.id, amountMinor: 5000, sortKey: 2 },
                { categoryId: byCode.get("EXAM")!.id, amountMinor: 8000, sortKey: 3 },
                { categoryId: byCode.get("BOOKS")!.id, amountMinor: 25000, sortKey: 4 },
                { categoryId: byCode.get("ICT")!.id, amountMinor: 12000, sortKey: 5 },
                { categoryId: byCode.get("FEEDING")!.id, amountMinor: 45000, sortKey: 6 },
                ...(boarderType === "BOARDER"
                  ? [{ categoryId: byCode.get("BOARDING")!.id, amountMinor: 180000, sortKey: 7 }]
                  : []),
              ],
            },
          },
        });
      }
    }
  }

  return categories;
}

type FeeCategoryRow = Awaited<ReturnType<typeof seedFeeStructures>>[number];

async function seedBilling(
  academicYearId: string,
  terms: TermRow[],
  students: StudentRow[],
  categories: FeeCategoryRow[],
) {
  console.log("  Invoices and payments…");

  const currentTerm = terms.find((term) => term.sequence === 2) ?? terms[0];
  const byCode = new Map(categories.map((category) => [category.code, category]));
  const bursar = await db.staff.findFirst({ where: { jobTitle: "Bursar" } });

  let invoiceNumber = 1;
  let receiptNumber = 1;
  const year = new Date().getFullYear();

  for (const student of students) {
    const isBoarder = student.isBoarder;
    const level = await db.enrollment.findFirst({
      where: { studentId: student.id },
      select: { classSection: { select: { classLevel: { select: { sequence: true } } } } },
    });
    const tier = Math.ceil((level?.classSection.classLevel.sequence ?? 1) / 4);
    const tuition = (900 + tier * 450) * 100;

    const lines = [
      { code: "TUITION", amount: tuition },
      { code: "PTA", amount: 5000 },
      { code: "EXAM", amount: 8000 },
      { code: "BOOKS", amount: 25000 },
      { code: "ICT", amount: 12000 },
      { code: "FEEDING", amount: 45000 },
      ...(isBoarder ? [{ code: "BOARDING", amount: 180000 }] : []),
    ];

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const discount = student.onScholarship ? Math.floor(subtotal * 0.5) : 0;
    const total = subtotal - discount;

    if (student.onScholarship) {
      await db.studentDiscount.create({
        data: {
          studentId: student.id,
          name: "Merit Scholarship",
          type: "PERCENTAGE",
          value: 50,
          academicYearId,
          reason: "Awarded for outstanding academic performance.",
          isActive: true,
          approvedBy: "Head Teacher",
        },
      });
    }

    const dueDate = addDays(currentTerm.startDate, 21);

    const invoice = await db.invoice.create({
      data: {
        invoiceNo: `INV-${year}-${String(invoiceNumber).padStart(5, "0")}`,
        studentId: student.id,
        academicYearId,
        termId: currentTerm.id,
        title: `${currentTerm.name} School Fees`,
        status: "ISSUED",
        subtotalMinor: subtotal,
        discountMinor: discount,
        totalMinor: total,
        balanceMinor: total,
        issueDate: currentTerm.startDate,
        dueDate,
        terms: "Part payments accepted. Kindly quote the invoice number on all payments.",
        lines: {
          create: lines.map((line, index) => ({
            categoryId: byCode.get(line.code)!.id,
            description: byCode.get(line.code)!.name,
            quantity: 1,
            unitPriceMinor: line.amount,
            discountMinor: student.onScholarship ? Math.floor(line.amount * 0.5) : 0,
            amountMinor: student.onScholarship
              ? line.amount - Math.floor(line.amount * 0.5)
              : line.amount,
            sortKey: index,
          })),
        },
      },
    });
    invoiceNumber += 1;

    // Payment behaviour: most families pay something, many pay in instalments.
    const roll = random();
    const payments: number[] = [];

    if (roll < 0.42) {
      payments.push(total); // Paid in full
    } else if (roll < 0.78) {
      // Part payments — the common case.
      const first = Math.floor(total * (0.4 + random() * 0.25));
      payments.push(first);
      if (chance(0.55)) payments.push(Math.floor((total - first) * (0.5 + random() * 0.4)));
    } else if (roll < 0.9) {
      payments.push(Math.floor(total * (0.15 + random() * 0.2))); // Token payment
    }
    // The remainder have paid nothing yet.

    let paidSoFar = 0;

    for (const [index, amount] of payments.entries()) {
      const channel = pick([
        "MOBILE_MONEY", "MOBILE_MONEY", "MOBILE_MONEY",
        "BANK_TRANSFER", "CASH", "CARD", "USSD", "CHEQUE",
      ] as const);

      const payment = await db.payment.create({
        data: {
          receiptNo: `RCT-${year}-${String(receiptNumber).padStart(5, "0")}`,
          reference: `PAY-${year}-${String(receiptNumber).padStart(6, "0")}`,
          studentId: student.id,
          amountMinor: amount,
          currency: "GHS",
          channel,
          provider: channel === "CASH" || channel === "CHEQUE" ? "MANUAL" : "PAYSTACK",
          status: "SUCCESS",
          momoNetwork: channel === "MOBILE_MONEY" ? pick(["MTN", "TELECEL", "AIRTELTIGO"]) : null,
          momoNumber: channel === "MOBILE_MONEY" ? phone() : null,
          cardLast4: channel === "CARD" ? String(between(1000, 9999)) : null,
          cardBrand: channel === "CARD" ? pick(["visa", "mastercard"]) : null,
          bankName: channel === "BANK_TRANSFER" ? pick(["Ecobank", "GCB Bank", "Absa", "Stanbic"]) : null,
          chequeNumber: channel === "CHEQUE" ? String(between(100000, 999999)) : null,
          payerName: `Parent of ${student.firstName} ${student.lastName}`,
          paidAt: addDays(dueDate, -between(0, 30) + index * 21),
          confirmedAt: new Date(),
          receivedById: bursar?.id,
          narration: index === 0 ? "First instalment" : `Instalment ${index + 1}`,
          isReconciled: true,
          allocations: {
            create: { invoiceId: invoice.id, amountMinor: amount },
          },
        },
      });
      receiptNumber += 1;
      paidSoFar += amount;
      void payment;
    }

    const balance = total - paidSoFar;
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        paidMinor: paidSoFar,
        balanceMinor: balance,
        status:
          balance === 0
            ? "PAID"
            : paidSoFar > 0
              ? dueDate < new Date()
                ? "OVERDUE"
                : "PART_PAID"
              : dueDate < new Date()
                ? "OVERDUE"
                : "ISSUED",
        paidAt: balance === 0 ? new Date() : null,
      },
    });

    // A few families are on a formal payment plan.
    if (balance > 0 && chance(0.12)) {
      const instalments = 3;
      const each = Math.floor(balance / instalments);
      await db.paymentPlan.create({
        data: {
          studentId: student.id,
          name: `${currentTerm.name} instalment plan`,
          totalMinor: balance,
          startDate: new Date(),
          status: "ACTIVE",
          approvedBy: "Bursar",
          installments: {
            create: Array.from({ length: instalments }, (_, index) => ({
              sequence: index + 1,
              amountMinor: index === instalments - 1 ? balance - each * (instalments - 1) : each,
              invoiceId: invoice.id,
              dueDate: addDays(new Date(), 30 * (index + 1)),
            })),
          },
        },
      });
    }
  }

  console.log(`    ${invoiceNumber - 1} invoices, ${receiptNumber - 1} receipts`);
}

async function seedCommunications(roles: Record<string, string>) {
  console.log("  Announcements, templates and reminder rules…");

  const head = await db.user.findFirst({ where: { email: "head@goldencrest.edu.gh" } });

  await db.messageTemplate.createMany({
    data: [
      {
        key: "fee.reminder.before",
        name: "Fee reminder — before due date",
        category: "FEES",
        channels: ["SMS", "EMAIL"],
        subject: "School Fees Reminder",
        body: "Dear {{guardian.firstName}},\n\nThis is a reminder that the fees for {{student.fullName}} ({{student.class}}) are due on {{invoice.dueDate}}. The outstanding balance is {{invoice.balance}}.\n\nPart payments are accepted. Thank you.\n\n{{school.name}}",
        smsBody: "Dear Parent, fees for {{student.fullName}} ({{student.class}}) are due {{invoice.dueDate}}. Balance: {{invoice.balance}}. Part payment accepted. {{school.name}}",
        variables: ["student.fullName", "student.class", "invoice.balance", "invoice.dueDate", "guardian.firstName"],
        isSystem: true,
      },
      {
        key: "fee.reminder.overdue",
        name: "Fee reminder — overdue",
        category: "FEES",
        channels: ["SMS", "EMAIL", "PUSH"],
        subject: "Outstanding School Fees",
        body: "Dear {{guardian.firstName}},\n\nOur records show an outstanding balance of {{invoice.balance}} for {{student.fullName}} ({{student.class}}), which was due on {{invoice.dueDate}}.\n\nKindly settle at your earliest convenience or contact the Bursary to arrange a payment plan.\n\n{{school.name}}",
        smsBody: "Dear Parent, {{student.fullName}} has an overdue fee balance of {{invoice.balance}}. Kindly settle or call {{school.phone}} to arrange a plan. {{school.name}}",
        variables: ["student.fullName", "invoice.balance", "invoice.dueDate", "school.phone"],
        isSystem: true,
      },
      {
        key: "attendance.absent",
        name: "Absence notification",
        category: "ATTENDANCE",
        channels: ["SMS", "PUSH"],
        subject: "Absence from school",
        body: "Dear {{guardian.firstName}}, {{student.fullName}} was marked absent today, {{date.today}}. Please contact the school office if this is unexpected.",
        smsBody: "{{student.fullName}} was marked absent on {{date.today}}. Please contact the school if unexpected. {{school.name}}",
        variables: ["student.fullName", "date.today", "guardian.firstName"],
        isSystem: true,
      },
      {
        key: "results.published",
        name: "Results published",
        category: "ACADEMIC",
        channels: ["SMS", "EMAIL", "PUSH"],
        subject: "{{term.name}} results are available",
        body: "Dear {{guardian.firstName}},\n\nThe {{term.name}} report card for {{student.fullName}} is now available in the parent portal.\n\n{{school.name}}",
        smsBody: "{{term.name}} results for {{student.fullName}} are now available in the parent portal. {{school.name}}",
        variables: ["student.fullName", "term.name", "guardian.firstName"],
        isSystem: true,
      },
    ],
  });

  const beforeTemplate = await db.messageTemplate.findUnique({
    where: { key: "fee.reminder.before" },
  });
  const overdueTemplate = await db.messageTemplate.findUnique({
    where: { key: "fee.reminder.overdue" },
  });

  await db.reminderRule.createMany({
    data: [
      {
        name: "7 days before due date",
        trigger: "BEFORE_DUE",
        offsetDays: 7,
        maxReminders: 1,
        minBalanceMinor: 5000,
        channels: ["SMS"],
        audience: "BILL_PAYERS",
        templateId: beforeTemplate?.id,
      },
      {
        name: "On the due date",
        trigger: "ON_DUE",
        maxReminders: 1,
        minBalanceMinor: 5000,
        channels: ["SMS", "EMAIL"],
        audience: "BILL_PAYERS",
        templateId: beforeTemplate?.id,
      },
      {
        name: "Weekly chase while overdue",
        trigger: "BALANCE_OUTSTANDING",
        repeatEveryDays: 7,
        maxReminders: 4,
        minBalanceMinor: 10000,
        channels: ["SMS", "PUSH"],
        audience: "BILL_PAYERS",
        templateId: overdueTemplate?.id,
      },
    ],
  });

  await db.announcement.createMany({
    data: [
      {
        title: "Mid-term break dates confirmed",
        summary: "School closes Friday and reopens the following Wednesday.",
        body: "Dear parents and students,\n\nThe mid-term break will run from Friday to the following Tuesday. School reopens on Wednesday at the normal time of 7:30am.\n\nBoarding students should be collected by 4:00pm on Friday.\n\nThank you.",
        category: "GENERAL",
        priority: "HIGH",
        status: "PUBLISHED",
        audiences: ["STAFF", "STUDENT", "GUARDIAN"],
        channels: ["IN_APP", "SMS", "PUSH"],
        isPinned: true,
        publishedAt: addDays(new Date(), -2),
        authorId: head?.id,
        viewCount: 184,
      },
      {
        title: "PTA General Meeting",
        summary: "All parents are invited to the termly PTA meeting.",
        body: "The Parent–Teacher Association will hold its general meeting in the Assembly Hall. The agenda includes the fee review, the new science laboratory, and the appointment of two new PTA executives.\n\nYour attendance is important.",
        category: "EVENT",
        priority: "NORMAL",
        status: "PUBLISHED",
        audiences: ["GUARDIAN"],
        channels: ["IN_APP", "EMAIL", "SMS"],
        publishedAt: addDays(new Date(), -5),
        authorId: head?.id,
        viewCount: 97,
      },
      {
        title: "Inter-House Athletics — house allocations",
        summary: "Check your house and report to your house master.",
        body: "The inter-house athletics competition takes place in three weeks. Kente, Adinkra, Sankofa and Gye Nyame houses should report to their house masters for training schedules.\n\nParents are welcome to attend.",
        category: "SPORTS",
        priority: "NORMAL",
        status: "PUBLISHED",
        audiences: ["STAFF", "STUDENT", "GUARDIAN"],
        channels: ["IN_APP", "PUSH"],
        publishedAt: addDays(new Date(), -8),
        authorId: head?.id,
        viewCount: 132,
      },
      {
        title: "Staff briefing — results deadline",
        summary: "All marks must be entered before the deadline.",
        body: "All teaching staff are reminded that end-of-term marks must be entered into the gradebook before the results deadline. Late entries will delay report card production for the whole class.",
        category: "GENERAL",
        priority: "URGENT",
        status: "PUBLISHED",
        audiences: ["STAFF"],
        channels: ["IN_APP", "EMAIL"],
        publishedAt: addDays(new Date(), -1),
        authorId: head?.id,
        viewCount: 21,
      },
    ],
  });

  void roles;
}

async function seedElections(sections: SectionRow[]) {
  console.log("  Elections…");

  // Matched on the class LEVEL, not the section. This filtered on section names
  // beginning with "J" back when a section was called "J3A"; sections now hold
  // only the stream letter — "A", "B" — so nothing matched, fewer than six
  // candidates came back, and the function returned before creating anything.
  // The elections module has been seeding an empty page ever since, and the
  // early return meant it did so silently.
  const candidateStudents = await db.student.findMany({
    where: {
      enrollments: {
        some: { classSection: { classLevel: { name: { startsWith: "JHS" } } } },
      },
    },
    take: 12,
    select: { id: true, firstName: true, lastName: true, photoUrl: true },
  });

  if (candidateStudents.length < 6) {
    console.warn(
      `    ! Only ${candidateStudents.length} JHS students found — skipping elections.`,
    );
    return;
  }

  const election = await db.election.create({
    data: {
      title: "Students' Representative Council Elections",
      slug: "src-elections",
      description:
        "Annual election of the Students' Representative Council. Every JHS student is eligible to vote.",
      kind: "SRC",
      status: "OPEN",
      nominationOpensAt: addDays(new Date(), -20),
      nominationClosesAt: addDays(new Date(), -8),
      opensAt: addDays(new Date(), -1),
      closesAt: addDays(new Date(), 3),
      eligiblePortals: ["STUDENT"],
      isSecret: true,
      showLiveResults: true,
      allowAbstain: true,
      instructions:
        "Select one candidate for each position. Your ballot is secret — the system records that you voted, never how you voted.",
      positions: {
        create: [
          {
            title: "SRC President",
            description: "Leads the council and represents students to management.",
            maxSelections: 1,
            seats: 1,
            sortKey: 1,
            candidates: {
              create: candidateStudents.slice(0, 3).map((student, index) => ({
                studentId: student.id,
                displayName: `${student.firstName} ${student.lastName}`,
                slogan: pick([
                  "A voice for every student",
                  "Together we rise",
                  "Service before self",
                ]),
                manifesto:
                  "I will push for better sports facilities, a student suggestion box that is actually read, and more study time in the library.",
                ballotOrder: index + 1,
                status: "APPROVED",
                voteCount: between(8, 40),
              })),
            },
          },
          {
            title: "SRC Secretary",
            maxSelections: 1,
            seats: 1,
            sortKey: 2,
            candidates: {
              create: candidateStudents.slice(3, 6).map((student, index) => ({
                studentId: student.id,
                displayName: `${student.firstName} ${student.lastName}`,
                slogan: pick(["Accurate records, clear minutes", "Organised and accountable"]),
                ballotOrder: index + 1,
                status: "APPROVED",
                voteCount: between(6, 35),
              })),
            },
          },
          {
            title: "Sports Prefect",
            maxSelections: 1,
            seats: 1,
            sortKey: 3,
            candidates: {
              create: candidateStudents.slice(6, 9).map((student, index) => ({
                studentId: student.id,
                displayName: `${student.firstName} ${student.lastName}`,
                slogan: pick(["More sports, more spirit", "Fitness for all"]),
                ballotOrder: index + 1,
                status: "APPROVED",
                voteCount: between(5, 30),
              })),
            },
          },
        ],
      },
    },
  });

  // Enrol student voters.
  const voters = await db.user.findMany({
    where: { portal: "STUDENT" },
    select: { id: true },
  });

  if (voters.length) {
    await db.voterRoll.createMany({
      data: voters.map((voter) => ({
        electionId: election.id,
        userId: voter.id,
        hasVoted: chance(0.55),
        votedAt: chance(0.55) ? addDays(new Date(), -between(0, 1)) : null,
      })),
    });
  }

  void sections;
}

async function seedDocuments() {
  console.log("  Document cabinet…");

  const folders = [
    { name: "Policies", slug: "policies", icon: "Shield", access: "STAFF" as const },
    { name: "Circulars & Memos", slug: "circulars", icon: "Mail", access: "STAFF" as const },
    { name: "Board & PTA Minutes", slug: "minutes", icon: "Users", access: "ROLE_RESTRICTED" as const },
    { name: "Curriculum", slug: "curriculum", icon: "BookOpen", access: "STAFF" as const },
    { name: "Licences & Registration", slug: "licences", icon: "Award", access: "ROLE_RESTRICTED" as const },
    { name: "Parent Handbook", slug: "handbook", icon: "Book", access: "SCHOOL_WIDE" as const },
  ];

  for (const [index, folder] of folders.entries()) {
    await db.documentFolder.create({
      data: {
        name: folder.name,
        slug: folder.slug,
        path: `/${folder.slug}`,
        icon: folder.icon,
        accessLevel: folder.access,
        isSystem: true,
        sortKey: index,
        description: `${folder.name} for the school.`,
      },
    });
  }
}

/**
 * Courses, lessons, an assignment and two quizzes.
 *
 * Deliberately concentrated on the demo student's own class (J2A) rather than
 * spread thinly across the school: the point of the demo data is that signing
 * in as the demo student shows a populated portal immediately, not that every
 * class has one lesson nobody looks at.
 */
async function seedLearning(
  offerings: OfferingRow[],
  students: StudentRow[],
  sections: SectionRow[],
  demoStudentSectionId: string | null,
) {
  console.log("  Courses, lessons and quizzes…");

  // Follow the demo student rather than a hardcoded class. Whoever holds the
  // demo login must land on a populated Courses tab, and that is the whole
  // point of seeding this material — pinning it to a class name would break
  // the moment the demo account moved to a student in a different year.
  const wantedSectionIds = [
    demoStudentSectionId,
    // The demo guardian's child sits here, so the parent portal has course
    // material to show too. Keyed on code — `name` is now just the stream.
    sections.find((section) => section.code === "J2-A")?.id ?? null,
  ].filter((id): id is string => Boolean(id));

  const uniqueSectionIds = [...new Set(wantedSectionIds)];

  const target = uniqueSectionIds.length
    ? offerings.filter((offering) => uniqueSectionIds.includes(offering.classSectionId))
    : offerings.slice(0, 4);

  if (!target.length) return;

  const subjectNames = await db.subject.findMany({
    where: { id: { in: target.map((offering) => offering.subjectId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(subjectNames.map((entry) => [entry.id, entry.name]));

  // Per-section, because the target can now span two classes — progress and
  // submissions must belong to the students actually in that course's class.
  const studentsBySection = new Map<string, StudentRow[]>();
  for (const student of students) {
    studentsBySection.set(student.sectionId, [
      ...(studentsBySection.get(student.sectionId) ?? []),
      student,
    ]);
  }

  const MODULES: Record<string, Array<{ title: string; lessons: string[] }>> = {
    default: [
      {
        title: "Unit 1 — Foundations",
        lessons: [
          "What this unit covers",
          "Key vocabulary and definitions",
          "Worked examples",
        ],
      },
      {
        title: "Unit 2 — Applying it",
        lessons: ["Practice problems", "Common mistakes and how to avoid them"],
      },
    ],
  };

  let created = 0;

  // Cap per class rather than overall, so a second class does not go empty
  // just because the first used up the budget.
  const perSection = new Map<string, number>();
  const chosen = target.filter((offering) => {
    const used = perSection.get(offering.classSectionId) ?? 0;
    if (used >= 5) return false;
    perSection.set(offering.classSectionId, used + 1);
    return true;
  });

  for (const [index, offering] of chosen.entries()) {
    const subject = nameOf.get(offering.subjectId) ?? "Subject";
    const classStudents = studentsBySection.get(offering.classSectionId) ?? [];

    const course = await db.course.create({
      data: {
        offeringId: offering.id,
        title: `${subject} — JHS 2`,
        code: `${subject.slice(0, 3).toUpperCase()}-J2-${index + 1}`,
        description: `Online material, assignments and quizzes for ${subject}.`,
        status: "PUBLISHED",
        allowDiscussion: true,
        syllabus: `This course follows the GES syllabus for ${subject} at JHS 2. Work through each unit in order; the quizzes at the end of a unit are there to tell you what to revisit.`,
        createdById: null,
      },
    });

    for (const [moduleIndex, moduleSpec] of MODULES.default.entries()) {
      const module = await db.courseModule.create({
        data: {
          courseId: course.id,
          title: moduleSpec.title,
          description: `${subject}: ${moduleSpec.title.toLowerCase()}.`,
          sortKey: (moduleIndex + 1) * 10,
          isPublished: true,
        },
      });

      for (const [lessonIndex, lessonTitle] of moduleSpec.lessons.entries()) {
        const lesson = await db.lesson.create({
          data: {
            moduleId: module.id,
            title: lessonTitle,
            contentType: lessonIndex === 1 ? "VIDEO" : "TEXT",
            content: `${lessonTitle}\n\nThis is demonstration material for ${subject}. In a real course this is where the teacher's notes, worked examples and diagrams would sit.\n\nWork through it, then mark the lesson complete so your teacher can see who is keeping up.`,
            videoUrl: lessonIndex === 1 ? "https://www.youtube.com/embed/aircAruvnKk" : null,
            durationMinutes: 10 + lessonIndex * 5,
            sortKey: (lessonIndex + 1) * 10,
            isPublished: true,
          },
        });

        // Some progress already recorded, so the teacher's engagement figure
        // is not a flat zero on a fresh install.
        for (const student of classStudents) {
          if (random() > 0.55) continue;
          await db.lessonProgress
            .create({
              data: {
                lessonId: lesson.id,
                studentId: student.id,
                percent: 100,
                completedAt: addDays(new Date(), -between(1, 20)),
                secondsSpent: between(120, 900),
              },
            })
            .catch(() => undefined);
        }
      }
    }

    // One assignment per course, already due, with most of the class in.
    const assignment = await db.assignment.create({
      data: {
        courseId: course.id,
        title: `${subject} — Unit 1 assignment`,
        instructions:
          "Answer all questions in your exercise book, then upload a photograph of your work. Show your working — marks are given for method as well as the final answer.",
        type: "FILE_UPLOAD",
        maxScore: 20,
        dueAt: addDays(new Date(), -3),
        allowLate: true,
        latePenaltyPercent: 10,
        isPublished: true,
      },
    });

    for (const student of classStudents) {
      const roll = random();
      if (roll > 0.85) continue; // not handed in

      const late = roll > 0.75;
      const graded = roll < 0.6;

      await db.submission
        .create({
          data: {
            assignmentId: assignment.id,
            studentId: student.id,
            status: graded ? "GRADED" : "SUBMITTED",
            textBody: "Please see the attached photograph of my working.",
            submittedAt: addDays(new Date(), late ? -1 : -5),
            isLate: late,
            score: graded ? between(9, 20) : null,
            feedback: graded
              ? pick([
                  "Good method throughout. Watch your units in question 3.",
                  "Well set out. Revisit the last question — the approach is right but the arithmetic slipped.",
                  "Strong work. Try to show one more line of working so the method is clear.",
                ])
              : null,
            gradedAt: graded ? addDays(new Date(), -1) : null,
          },
        })
        .catch(() => undefined);
    }

    created += 1;
  }

  // --- Quizzes -------------------------------------------------------------
  // One open quiz with a mix of question types so every marking path is
  // exercised, and one already closed so the results view has something in it.
  //
  // Both go to the demo student's own class: a quiz they cannot open is not a
  // demonstration of anything.
  const quizSectionId = demoStudentSectionId ?? uniqueSectionIds[0] ?? null;

  const quizOfferingIds = chosen
    .filter((offering) => !quizSectionId || offering.classSectionId === quizSectionId)
    .map((offering) => offering.id);

  const quizCourses = await db.course.findMany({
    where: {
      offeringId: { in: quizOfferingIds.length ? quizOfferingIds : chosen.map((o) => o.id) },
    },
    select: { id: true, title: true },
    take: 2,
  });

  for (const [index, course] of quizCourses.entries()) {
    const isOpen = index === 0;

    const quiz = await db.quiz.create({
      data: {
        courseId: course.id,
        title: isOpen ? "Unit 1 check-up" : "Unit 1 test (closed)",
        description: isOpen
          ? "A short quiz to check you have understood Unit 1. You have two attempts."
          : "This quiz has closed. Your result and the answers are shown below.",
        timeLimitMinutes: isOpen ? 15 : 20,
        maxAttempts: isOpen ? 2 : 1,
        passMark: 50,
        shuffleQuestions: true,
        shuffleOptions: true,
        showAnswersAfter: isOpen ? "AFTER_CLOSE" : "IMMEDIATELY",
        opensAt: addDays(new Date(), -7),
        closesAt: isOpen ? addDays(new Date(), 14) : addDays(new Date(), -1),
        isPublished: true,
      },
    });

    const questions: Array<{
      type: "MULTIPLE_CHOICE" | "MULTIPLE_ANSWER" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
      prompt: string;
      points: number;
      options?: Array<{ text: string; isCorrect: boolean }>;
      accepted?: string[];
      explanation?: string;
    }> = [
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which of these is the capital city of Ghana?",
        points: 1,
        options: [
          { text: "Accra", isCorrect: true },
          { text: "Kumasi", isCorrect: false },
          { text: "Takoradi", isCorrect: false },
          { text: "Tamale", isCorrect: false },
        ],
        explanation: "Accra has been the capital since 1877.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "The Volta River is the longest river in Ghana.",
        points: 1,
        options: [
          { text: "True", isCorrect: true },
          { text: "False", isCorrect: false },
        ],
      },
      {
        type: "MULTIPLE_ANSWER",
        prompt: "Select every region that borders the Greater Accra Region.",
        points: 2,
        options: [
          { text: "Eastern", isCorrect: true },
          { text: "Volta", isCorrect: true },
          { text: "Central", isCorrect: true },
          { text: "Upper West", isCorrect: false },
        ],
        explanation: "Upper West is in the far north and shares no boundary.",
      },
      {
        type: "SHORT_ANSWER",
        prompt: "Name the body of water that lies to the south of Ghana.",
        points: 1,
        accepted: ["Gulf of Guinea", "Atlantic Ocean", "the Atlantic"],
      },
      {
        type: "ESSAY",
        prompt:
          "In two or three sentences, explain why the Akosombo Dam was built and one effect it had.",
        points: 5,
        explanation: "Marked by your teacher.",
      },
    ];

    for (const [questionIndex, spec] of questions.entries()) {
      await db.quizQuestion.create({
        data: {
          quizId: quiz.id,
          type: spec.type,
          prompt: spec.prompt,
          points: spec.points,
          explanation: spec.explanation ?? null,
          acceptedAnswers: spec.accepted ?? [],
          sortKey: (questionIndex + 1) * 10,
          ...(spec.options
            ? {
                options: {
                  create: spec.options.map((option, optionIndex) => ({
                    text: option.text,
                    isCorrect: option.isCorrect,
                    sortKey: optionIndex,
                  })),
                },
              }
            : {}),
        },
      });
    }
  }

  console.log(`    ${created} courses with lessons, assignments and quizzes.`);
}

/**
 * A default certificate and transcript template.
 *
 * Without these a fresh install cannot issue a certificate at all — the issue
 * form requires a template and there were none to choose. Both use the same
 * starter layout the in-app designer produces, so they are immediately usable
 * and immediately editable.
 */
async function seedDocumentTemplates() {
  console.log("  Certificate and transcript templates…");

  await db.documentTemplate.create({
    data: {
      name: "Standard certificate",
      kind: "CERTIFICATE",
      description: "Landscape certificate with the school crest and a verification code.",
      source: "BUILDER",
      pageSize: "A4",
      orientation: "LANDSCAPE",
      isDefault: true,
      layout: {
        ...starterLayout("CERTIFICATE"),
        border: "classic",
        accent: "#128257",
      } as never,
    },
  });

  await db.documentTemplate.create({
    data: {
      name: "Standard transcript",
      kind: "TRANSCRIPT",
      description: "Portrait transcript with the full results table.",
      source: "BUILDER",
      pageSize: "A4",
      orientation: "PORTRAIT",
      isDefault: true,
      layout: {
        ...starterLayout("TRANSCRIPT"),
        border: "minimal",
        accent: "#128257",
      } as never,
    },
  });
}

/**
 * Draws the school a crest and puts it everywhere branding is read from.
 *
 * Without one the demo is a school with a blank square where its identity
 * should be — in the sidebar, on report card headers, on certificates and at
 * the top of its own website. It is drawn rather than shipped as a binary so
 * the repository stays free of assets nobody can edit, and it goes into the
 * media library rather than straight into storage because that route is the
 * public one: `/api/files` demands a session, which a visitor to the school's
 * website does not have.
 *
 * Cosmetic, so a storage misconfiguration warns and moves on. Somebody seeding
 * before they have set up a bucket should still get a working school.
 */
async function seedBranding(school: { id: string }, siteId: string) {
  console.log("  Crest…");

  // Geometry only, no text: rendering a font depends on what is installed in
  // the container, and a crest with an invisible monogram is worse than one
  // without a monogram.
  const crest = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#16a06b"/>
        <stop offset="1" stop-color="#0b5c3d"/>
      </linearGradient>
    </defs>
    <path d="M256 28 L436 96 V268 C436 372 356 442 256 484 C156 442 76 372 76 268 V96 Z"
          fill="url(#shield)" stroke="#d9a325" stroke-width="16" stroke-linejoin="round"/>
    <path d="M150 232 L256 196 L362 232 L362 256 L256 220 L150 256 Z" fill="#d9a325"/>
    <path d="M150 300 Q202 280 248 300 L248 374 Q202 354 150 374 Z" fill="#f8fafc"/>
    <path d="M264 300 Q310 280 362 300 L362 374 Q310 354 264 374 Z" fill="#f8fafc"/>
    <rect x="248" y="296" width="16" height="82" rx="4" fill="#d9a325"/>
  </svg>`;

  try {
    const png = await sharp(Buffer.from(crest)).png({ compressionLevel: 9 }).toBuffer();

    const stored = await storeFile({
      buffer: png,
      originalName: "golden-crest.png",
      mimeType: "image/png",
      folder: "branding",
    });

    const media = await db.siteMedia.create({
      data: {
        siteId,
        fileId: stored.id,
        altText: "Golden Crest International School crest",
        caption: "School crest",
        folder: "branding",
        transforms: {} as never,
      },
    });

    const url = `/api/media/${media.id}`;
    await db.school.update({
      where: { id: school.id },
      data: { logoUrl: url, crestUrl: url },
    });
    await db.site.update({ where: { id: siteId }, data: { logoUrl: url, faviconUrl: url } });
  } catch (error) {
    console.warn(
      `    ! Could not store the crest (${(error as Error).message}). The school will have no logo.`,
    );
  }
}

/**
 * Geometric artwork for the demo site, drawn rather than shipped.
 *
 * The design is image-hungry — hero photograph, programme cards, an
 * admissions banner — and a seed cannot ship photographs of children who do
 * not exist. These are abstract campus scenes in the brand palette: layered
 * shapes, an arch, a sun. Deterministic (no RNG), so the seed stays
 * repeatable, and registered in the media library so the public site can
 * serve them without a session.
 */
async function seedSiteArt(siteId: string): Promise<Record<string, string>> {
  console.log("  Site artwork…");

  const NAVY = "#0B2447";
  const BLUE = "#2C66CE";
  const GOLD = "#E9A319";
  const CREAM = "#FAF6EE";

  // Each scene: a soft field, a horizon band, buildings, a sun, an accent
  // arc. The `shift` parameter moves the composition so five images read as
  // five pictures rather than one copied about.
  const scene = (width: number, height: number, shift: number, dark: boolean) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${dark ? NAVY : CREAM}"/>
    <circle cx="${width * (0.72 + shift * 0.05)}" cy="${height * 0.24}" r="${height * 0.13}" fill="${GOLD}" opacity="0.9"/>
    <rect x="${-width * 0.05}" y="${height * 0.62}" width="${width * 1.1}" height="${height * 0.38}" fill="${dark ? "#132F5C" : "#EADFC8"}"/>
    <rect x="${width * (0.08 + shift * 0.08)}" y="${height * 0.38}" width="${width * 0.2}" height="${height * 0.32}" rx="${width * 0.012}" fill="${BLUE}"/>
    <rect x="${width * (0.32 + shift * 0.08)}" y="${height * 0.3}" width="${width * 0.26}" height="${height * 0.4}" rx="${width * 0.012}" fill="${dark ? "#1C3F7D" : NAVY}"/>
    <rect x="${width * (0.62 + shift * 0.04)}" y="${height * 0.46}" width="${width * 0.18}" height="${height * 0.24}" rx="${width * 0.012}" fill="${dark ? "#2C66CE" : "#1C3F7D"}"/>
    <path d="M ${width * (0.35 + shift * 0.08)} ${height * 0.3}
             A ${width * 0.1} ${width * 0.1} 0 0 1 ${width * (0.55 + shift * 0.08)} ${height * 0.3}"
          fill="${GOLD}"/>
    ${[0, 1, 2, 3]
      .map(
        (column) => `
    <rect x="${width * (0.345 + shift * 0.08) + column * width * 0.055}" y="${height * 0.38}"
          width="${width * 0.028}" height="${height * 0.1}" rx="${width * 0.008}"
          fill="${dark ? CREAM : "#FFFFFF"}" opacity="0.85"/>`,
      )
      .join("")}
    <circle cx="${width * (0.14 + shift * 0.06)}" cy="${height * 0.78}" r="${height * 0.075}" fill="${GOLD}" opacity="0.35"/>
    <circle cx="${width * 0.88}" cy="${height * 0.82}" r="${height * 0.1}" fill="${BLUE}" opacity="${dark ? 0.4 : 0.18}"/>
  </svg>`;

  const pieces: Array<{ key: string; width: number; height: number; shift: number; dark: boolean; alt: string }> = [
    { key: "hero", width: 1200, height: 900, shift: 0, dark: false, alt: "Campus scene" },
    { key: "campus", width: 1000, height: 750, shift: 1, dark: false, alt: "School buildings" },
    { key: "programmeA", width: 800, height: 600, shift: -1, dark: false, alt: "Early years" },
    { key: "programmeB", width: 800, height: 600, shift: 2, dark: true, alt: "Primary school" },
    { key: "programmeC", width: 800, height: 600, shift: 0.5, dark: false, alt: "Junior high" },
    { key: "admissions", width: 1000, height: 750, shift: -0.5, dark: true, alt: "Admissions" },
  ];

  const urls: Record<string, string> = {};

  for (const piece of pieces) {
    try {
      const png = await sharp(Buffer.from(scene(piece.width, piece.height, piece.shift, piece.dark)))
        .png({ compressionLevel: 9 })
        .toBuffer();

      const stored = await storeFile({
        buffer: png,
        originalName: `site-${piece.key}.png`,
        mimeType: "image/png",
        folder: "site-art",
      });

      const media = await db.siteMedia.create({
        data: {
          siteId,
          fileId: stored.id,
          altText: piece.alt,
          folder: "site-art",
          transforms: {} as never,
        },
      });

      urls[piece.key] = `/api/media/${media.id}`;
    } catch (error) {
      // Cosmetic: a school seeded before storage is configured still gets a
      // working site, with the imageless layouts.
      console.warn(`    ! Could not store site art "${piece.key}": ${(error as Error).message}`);
    }
  }

  return urls;
}

/**
 * A starter shelf for the question bank, so the feature demonstrates itself:
 * open any quiz and its subject's shelf offers questions to copy in.
 * Deterministic, no RNG.
 */
/**
 * Three months of payroll: two paid, the month just gone left as a draft so
 * the approval flow has something to approve on a fresh demo. No RNG — the
 * figures come from the salaries, which are themselves deterministic.
 */
async function seedPayroll(staff: StaffRow[]) {
  console.log("  Payroll…");

  const onPayroll = staff.filter((member) => member.basicSalaryMinor !== null);
  if (!onPayroll.length) return;

  const now = new Date();
  const periods = [0, 1, 2].map((back) => {
    const date = new Date(now.getFullYear(), now.getMonth() - back - 1, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1, back };
  });

  for (const period of periods) {
    const status = period.back === 0 ? "DRAFT" : "PAID";
    const paidOn = new Date(period.year, period.month, 0);

    const run = await db.payrollRun.create({
      data: {
        year: period.year,
        month: period.month,
        status,
        approvedBy: status === "PAID" ? "Mrs Abena Owusu" : null,
        approvedAt: status === "PAID" ? paidOn : null,
        paidAt: status === "PAID" ? paidOn : null,
      },
      select: { id: true },
    });

    await db.payslip.createMany({
      data: onPayroll.map((member) => {
        const allowances = parseAllowances(member.salaryAllowances);
        const figures = computePayslip({
          basicMinor: member.basicSalaryMinor ?? 0,
          allowances,
        });
        return {
          runId: run.id,
          staffId: member.id,
          staffName: [member.title, member.firstName, member.lastName]
            .filter(Boolean)
            .join(" "),
          staffNo: member.staffNo,
          basicMinor: figures.basicMinor,
          allowances,
          grossMinor: figures.grossMinor,
          ssnitEmployeeMinor: figures.ssnitEmployeeMinor,
          ssnitEmployerMinor: figures.ssnitEmployerMinor,
          payeMinor: figures.payeMinor,
          netMinor: figures.netMinor,
          paymentMethod: member.bankAccountNo ? "BANK" : member.momoNumber ? "MOMO" : "CASH",
        };
      }),
    });
  }
}

/**
 * A school library that looks like one.
 *
 * Weighted the way a Ghanaian international school's shelves actually are:
 * West African writing alongside the British and American set texts, several
 * copies of each class reader because thirty children read it at once, one
 * copy of each reference work, and a run of past papers. Every title carries
 * real accession numbers so the issue desk can be used the moment the seed
 * finishes — the demo is only useful if someone can type a number into it.
 */
/**
 * Three routes out of Accra, with the buses that run them.
 *
 * The routes follow real corridors — Spintex/Tema, East Legon/Adenta, and the
 * Airport Residential loop — because a demo whose stops are "Stop 1, Stop 2"
 * cannot be checked against anything. Registrations are in Ghanaian format,
 * one bus is a month from its roadworthy expiring so the warning has
 * something to warn about, and one route is deliberately left a seat short of
 * comfortable so the capacity arithmetic is visible rather than theoretical.
 */
async function seedTransport(students: StudentRow[], staff: StaffRow[]) {
  console.log("  Transport…");

  const day = 86_400_000;
  const today = new Date();

  const plan: Array<{
    code: string;
    name: string;
    description: string;
    durationMins: number;
    feeMajor: number;
    stops: Array<{ name: string; landmark: string; pickup: string; dropoff: string }>;
    buses: Array<{ registration: string; make: string; capacity: number; expiresInDays: number }>;
    riders: number;
  }> = [
    {
      code: "R1",
      name: "Spintex — Tema",
      description: "Along the Spintex Road and into Tema Community 7.",
      durationMins: 55,
      feeMajor: 450,
      stops: [
        { name: "Spintex Junction", landmark: "opposite the Total filling station", pickup: "06:30", dropoff: "15:45" },
        { name: "Baatsona", landmark: "by the traffic light", pickup: "06:45", dropoff: "15:30" },
        { name: "Nungua Barrier", landmark: "at the police post", pickup: "07:00", dropoff: "15:15" },
        { name: "Tema Community 7", landmark: "beside the Presbyterian church", pickup: "07:15", dropoff: "15:00" },
      ],
      buses: [
        { registration: "GT 4821-24", make: "Toyota Coaster", capacity: 30, expiresInDays: 200 },
      ],
      riders: 26,
    },
    {
      code: "R2",
      name: "East Legon — Adenta",
      description: "East Legon, through Ogbojo and up to Adenta Barrier.",
      durationMins: 45,
      feeMajor: 450,
      stops: [
        { name: "East Legon American House", landmark: "at the roundabout", pickup: "06:40", dropoff: "15:40" },
        { name: "Ogbojo", landmark: "opposite the Shell station", pickup: "06:55", dropoff: "15:25" },
        { name: "Adenta Barrier", landmark: "by the overhead", pickup: "07:10", dropoff: "15:10" },
      ],
      buses: [
        // A month from expiry, so the warning on the transport page is real.
        { registration: "GR 1907-23", make: "Mercedes Sprinter", capacity: 22, expiresInDays: 21 },
      ],
      riders: 20,
    },
    {
      code: "R3",
      name: "Airport Residential loop",
      description: "The short loop through Airport Residential and Dzorwulu.",
      durationMins: 30,
      feeMajor: 380,
      stops: [
        { name: "Airport Residential", landmark: "at the Marina Mall gate", pickup: "07:00", dropoff: "15:35" },
        { name: "Dzorwulu", landmark: "by the Fiesta Royale", pickup: "07:12", dropoff: "15:22" },
      ],
      buses: [
        { registration: "GX 2255-25", make: "Toyota Hiace", capacity: 15, expiresInDays: 400 },
      ],
      riders: 13,
    },
  ];

  // Drivers come from the staff list where the school has them on the books.
  const drivers = staff.slice(0, plan.length);

  // seedStudents returns the school in section order — every Nursery child,
  // then every KG child, and so on. Walking it from the start put the entire
  // bus fleet in the nursery: no demo login had a bus, the manifest read like
  // a creche run, and the class column was the same value forty times. Taking
  // every nth child instead spreads the routes across the school, which is
  // what a real bus list looks like.
  const stride = Math.max(1, Math.floor(students.length / 90));
  const riders: StudentRow[] = [];
  for (let index = 0; index < students.length; index += stride) {
    riders.push(students[index]);
  }

  let cursor = 0;
  let placed = 0;

  for (const [index, entry] of plan.entries()) {
    const route = await db.transportRoute.create({
      data: {
        code: entry.code,
        name: entry.name,
        description: entry.description,
        durationMins: entry.durationMins,
        feeMinor: entry.feeMajor * 100,
      },
      select: { id: true },
    });

    const stops = [];
    for (const [order, stop] of entry.stops.entries()) {
      stops.push(
        await db.transportStop.create({
          data: {
            routeId: route.id,
            name: stop.name,
            landmark: stop.landmark,
            sequence: order + 1,
            pickupTime: stop.pickup,
            dropoffTime: stop.dropoff,
          },
          select: { id: true },
        }),
      );
    }

    for (const bus of entry.buses) {
      const driver = drivers[index];
      await db.transportVehicle.create({
        data: {
          routeId: route.id,
          registration: bus.registration,
          make: bus.make,
          capacity: bus.capacity,
          driverStaffId: driver?.id ?? null,
          driverPhone: `+2332055501${String(20 + index).padStart(2, "0")}`,
          assistantName: ["Comfort Adjei", "Mavis Owusu", "Grace Tetteh"][index] ?? null,
          assistantPhone: `+2332455501${String(40 + index).padStart(2, "0")}`,
          roadworthyExpiry: new Date(today.getTime() + bus.expiresInDays * day),
          insuranceExpiry: new Date(today.getTime() + (bus.expiresInDays + 60) * day),
        },
      });
    }

    // Children spread across the stops, a few travelling one way only — which
    // is what makes the morning and afternoon counts differ, and therefore
    // what makes the capacity arithmetic worth having.
    for (let rider = 0; rider < entry.riders && cursor < riders.length; rider += 1) {
      const student = riders[cursor++];
      const direction =
        rider % 9 === 0 ? "MORNING" : rider % 11 === 0 ? "AFTERNOON" : "BOTH";

      await db.transportAssignment.create({
        data: {
          studentId: student.id,
          routeId: route.id,
          // Two children per route are left without a stop, so the "no stop
          // recorded" group on the route page and the manifest is exercised
          // rather than being a branch nobody has seen.
          stopId: rider < 2 ? null : stops[rider % stops.length].id,
          direction,
          collectedBy: rider % 13 === 0 ? "Grandmother — Auntie Akosua" : null,
        },
      });

      // The record they arrived with should agree with the arrangement.
      await db.student.update({
        where: { id: student.id },
        data: { transportMode: "SCHOOL_BUS", busRoute: null },
      });
      placed += 1;
    }
  }

  // Exactly four the admission form says come by bus who were never put on a
  // route — the gap the transport page warns about, which exists in every
  // school and should exist in the demo. Four, and not "whatever is left":
  // seedStudents already scatters transportMode across the whole school, so
  // this loop is the only one that should be adding to that count, and a
  // banner reading sixty is a banner nobody reads.
  for (let index = 0; index < 4 && cursor < riders.length; index += 1) {
    await db.student.update({
      where: { id: riders[cursor++].id },
      data: { transportMode: "SCHOOL_BUS", busRoute: "Route 3 (per admission form)" },
    });
  }

  // Everyone else who is not on a route should not claim to come by bus, or
  // the warning counts children the office never intended to arrange for.
  await db.student.updateMany({
    where: {
      transportMode: "SCHOOL_BUS",
      busRoute: null,
      transport: { none: { endedOn: null } },
    },
    data: { transportMode: "PRIVATE" },
  });

  console.log(`    ${plan.length} routes, ${placed} children riding`);
}

async function seedLibrary(subjects: SubjectRow[], students: StudentRow[], staff: StaffRow[]) {
  console.log("  Library…");

  const subjectId = (code: string) =>
    subjects.find((subject) => subject.code === code)?.id ?? null;

  const catalogue: Array<{
    title: string;
    author: string;
    category: string;
    copies: number;
    subject?: string;
    shelfMark?: string;
    isbn?: string;
    publisher?: string;
    published?: number;
    summary?: string;
  }> = [
    {
      title: "Things Fall Apart",
      author: "Chinua Achebe",
      category: "FICTION",
      copies: 12,
      subject: "ENG",
      shelfMark: "F ACH",
      isbn: "9780385474542",
      publisher: "Heinemann",
      published: 1958,
      summary: "Okonkwo, Umuofia, and the arrival of the missionaries.",
    },
    {
      title: "The Beautyful Ones Are Not Yet Born",
      author: "Ayi Kwei Armah",
      category: "FICTION",
      copies: 8,
      subject: "ENG",
      shelfMark: "F ARM",
      publisher: "Heinemann",
      published: 1968,
      summary: "A railway clerk in Accra who will not take the bribe.",
    },
    {
      title: "Anowa",
      author: "Ama Ata Aidoo",
      category: "FICTION",
      copies: 10,
      subject: "ENG",
      shelfMark: "F AID",
      publisher: "Longman",
      published: 1970,
    },
    {
      title: "Faceless",
      author: "Amma Darko",
      category: "FICTION",
      copies: 9,
      subject: "ENG",
      shelfMark: "F DAR",
      publisher: "Sub-Saharan Publishers",
      published: 2003,
    },
    {
      title: "The Gods Are Not to Blame",
      author: "Ola Rotimi",
      category: "FICTION",
      copies: 8,
      subject: "ENG",
      shelfMark: "F ROT",
      published: 1968,
    },
    {
      title: "Matilda",
      author: "Roald Dahl",
      category: "FICTION",
      copies: 6,
      shelfMark: "F DAH",
      publisher: "Puffin",
      published: 1988,
    },
    {
      title: "Charlie and the Chocolate Factory",
      author: "Roald Dahl",
      category: "FICTION",
      copies: 5,
      shelfMark: "F DAH",
      publisher: "Puffin",
      published: 1964,
    },
    {
      title: "Sosu's Call",
      author: "Meshack Asare",
      category: "FICTION",
      copies: 7,
      shelfMark: "F ASA",
      publisher: "Sub-Saharan Publishers",
      published: 1997,
      summary: "A boy who cannot walk saves his village. Set on the Ghanaian coast.",
    },
    {
      title: "Ghana Mathematics for Junior High Schools, Book 2",
      author: "Ministry of Education",
      category: "TEXTBOOK",
      copies: 35,
      subject: "MATH",
      shelfMark: "510 GES",
      publisher: "GES",
      published: 2021,
    },
    {
      title: "Integrated Science for JHS, Book 2",
      author: "Ministry of Education",
      category: "TEXTBOOK",
      copies: 35,
      subject: "SCI",
      shelfMark: "500 GES",
      publisher: "GES",
      published: 2021,
    },
    {
      title: "Social Studies for Junior High Schools",
      author: "Ministry of Education",
      category: "TEXTBOOK",
      copies: 30,
      subject: "SOC",
      shelfMark: "300 GES",
      publisher: "GES",
      published: 2021,
    },
    {
      title: "Oxford Advanced Learner's Dictionary",
      author: "A. S. Hornby",
      category: "REFERENCE",
      copies: 4,
      subject: "ENG",
      shelfMark: "R 423 HOR",
      publisher: "Oxford University Press",
      published: 2020,
    },
    {
      title: "Philip's Modern School Atlas",
      author: "Philip's",
      category: "REFERENCE",
      copies: 6,
      shelfMark: "R 912 PHI",
      publisher: "Philip's",
      published: 2019,
    },
    {
      title: "BECE Past Questions and Answers 2015–2024",
      author: "Compiled",
      category: "PAST_PAPER",
      copies: 15,
      shelfMark: "P BECE",
      published: 2024,
    },
    {
      title: "IGCSE Mathematics Past Papers",
      author: "Cambridge Assessment",
      category: "PAST_PAPER",
      copies: 8,
      subject: "MATH",
      shelfMark: "P IGCSE",
      published: 2024,
    },
    {
      title: "New African",
      author: "IC Publications",
      category: "PERIODICAL",
      copies: 3,
      shelfMark: "PER NA",
    },
  ];

  let accession = 4800;
  const allCopies: Array<{ id: string; itemId: string; category: string }> = [];

  for (const entry of catalogue) {
    const item = await db.libraryItem.create({
      data: {
        title: entry.title,
        author: entry.author,
        category: entry.category,
        subjectId: entry.subject ? subjectId(entry.subject) : null,
        shelfMark: entry.shelfMark ?? null,
        isbn: entry.isbn ?? null,
        publisher: entry.publisher ?? null,
        published: entry.published ?? null,
        summary: entry.summary ?? null,
      },
      select: { id: true },
    });

    for (let index = 0; index < entry.copies; index += 1) {
      accession += 1;
      const copy = await db.libraryCopy.create({
        data: {
          itemId: item.id,
          accessionNo: `GCS-${String(accession).padStart(6, "0")}`,
          // A shelf that is all NEW has never been used by anyone.
          condition: index % 7 === 0 ? "FAIR" : index % 3 === 0 ? "NEW" : "GOOD",
          costMinor: 4500 + (index % 4) * 1500,
          acquiredOn: new Date(2023, index % 12, 1 + (index % 27)),
        },
        select: { id: true },
      });
      allCopies.push({ id: copy.id, itemId: item.id, category: entry.category });
    }
  }

  // Loans. Reference and periodicals never leave, so they are not eligible —
  // seeding a state the desk would refuse to create would make the demo lie
  // about its own rules.
  const lendable = allCopies.filter(
    (copy) => copy.category !== "REFERENCE" && copy.category !== "PERIODICAL",
  );

  const today = new Date();
  const day = 86_400_000;
  let cursor = 0;

  // Returned history first: a library with no reading history has no history
  // to show on a child's record, which is half the point of keeping it.
  for (let index = 0; index < 60 && cursor < lendable.length; index += 1) {
    const copy = lendable[cursor++];
    const student = students[index % students.length];
    const issued = new Date(today.getTime() - (30 + index * 3) * day);
    const due = new Date(issued.getTime() + 14 * day);
    await db.libraryLoan.create({
      data: {
        copyId: copy.id,
        studentId: student.id,
        issuedAt: issued,
        dueAt: due,
        // Most come back on time; some a few days late.
        returnedAt: new Date(due.getTime() - (index % 5 === 0 ? -4 : 2) * day),
        returnCondition: index % 11 === 0 ? "FAIR" : null,
      },
    });
  }

  // Out now, within date.
  for (let index = 0; index < 18 && cursor < lendable.length; index += 1) {
    const copy = lendable[cursor++];
    const student = students[(index * 7) % students.length];
    const issued = new Date(today.getTime() - (index % 10) * day);
    await db.libraryLoan.create({
      data: {
        copyId: copy.id,
        studentId: student.id,
        issuedAt: issued,
        dueAt: new Date(issued.getTime() + 14 * day),
      },
    });
    await db.libraryCopy.update({
      where: { id: copy.id },
      data: { status: "ON_LOAN" },
    });
  }

  // Overdue, so the desk opens on something to do.
  for (let index = 0; index < 5 && cursor < lendable.length; index += 1) {
    const copy = lendable[cursor++];
    const student = students[(index * 13 + 3) % students.length];
    const issued = new Date(today.getTime() - (25 + index * 4) * day);
    await db.libraryLoan.create({
      data: {
        copyId: copy.id,
        studentId: student.id,
        issuedAt: issued,
        dueAt: new Date(issued.getTime() + 14 * day),
      },
    });
    await db.libraryCopy.update({
      where: { id: copy.id },
      data: { status: "ON_LOAN" },
    });
  }

  // Staff keep set texts for the term.
  for (let index = 0; index < 6 && cursor < lendable.length; index += 1) {
    const copy = lendable[cursor++];
    const person = staff[index % staff.length];
    const issued = new Date(today.getTime() - (index * 6) * day);
    await db.libraryLoan.create({
      data: {
        copyId: copy.id,
        staffId: person.id,
        issuedAt: issued,
        dueAt: new Date(issued.getTime() + 42 * day),
      },
    });
    await db.libraryCopy.update({
      where: { id: copy.id },
      data: { status: "ON_LOAN" },
    });
  }

  // One lost and one being repaired, so those states are not theoretical.
  if (cursor + 1 < lendable.length) {
    await db.libraryCopy.update({
      where: { id: lendable[cursor++].id },
      data: { status: "LOST", notes: "Not returned at the end of last year." },
    });
    await db.libraryCopy.update({
      where: { id: lendable[cursor++].id },
      data: { status: "REPAIR", condition: "POOR", notes: "Spine detached; with the binder." },
    });
  }

  console.log(
    `    ${catalogue.length} titles, ${allCopies.length} copies, ${cursor} in circulation`,
  );
}

async function seedQuestionBank(subjects: SubjectRow[]) {
  console.log("  Question bank…");

  const shelfOf = (code: string) => subjects.find((subject) => subject.code === code)?.id;

  const questions: Array<{
    subject: string;
    prompt: string;
    options?: string[]; // leading * marks correct
    accepted?: string[];
    explanation?: string;
  }> = [
    {
      subject: "MATH",
      prompt: "What is the value of 7 × 8?",
      options: ["*56", "54", "63", "48"],
    },
    {
      subject: "MATH",
      prompt: "Simplify: 3(x + 4) − 2x",
      options: ["*x + 12", "5x + 4", "x + 4", "3x + 12"],
      explanation: "Expand to 3x + 12, subtract 2x.",
    },
    {
      subject: "MATH",
      prompt: "A trader buys an item for GH₵80 and sells it for GH₵100. What is the percentage profit?",
      options: ["*25%", "20%", "80%", "12.5%"],
      explanation: "Profit 20 on cost 80 → 20/80 = 25%.",
    },
    {
      subject: "ENG",
      prompt: "Choose the correct sentence.",
      options: [
        "*The children were playing in the compound.",
        "The children was playing in the compound.",
        "The children is playing in the compound.",
        "The children be playing in the compound.",
      ],
    },
    {
      subject: "ENG",
      prompt: "What is the plural of “mouse”?",
      accepted: ["mice"],
    },
    {
      subject: "SCI",
      prompt: "Which gas do plants take in during photosynthesis?",
      options: ["*Carbon dioxide", "Oxygen", "Nitrogen", "Hydrogen"],
    },
    {
      subject: "SCI",
      prompt: "Water boils at 100°C at sea level.",
      options: ["*True", "False"],
    },
    {
      subject: "SOC",
      prompt: "In which year did Ghana gain independence?",
      options: ["*1957", "1960", "1951", "1966"],
      explanation: "6 March 1957.",
    },
  ];

  for (const question of questions) {
    const type = question.accepted
      ? "SHORT_ANSWER"
      : question.options?.length === 2 &&
          question.options.every((option) => ["*True", "True", "*False", "False"].includes(option))
        ? "TRUE_FALSE"
        : "MULTIPLE_CHOICE";

    await db.quizQuestion.create({
      data: {
        quizId: null,
        subjectId: shelfOf(question.subject) ?? null,
        type: type as never,
        prompt: question.prompt,
        points: 1,
        explanation: question.explanation ?? null,
        acceptedAnswers: question.accepted ?? [],
        ...(question.options
          ? {
              options: {
                create: question.options.map((option, index) => ({
                  text: option.replace(/^\*/, ""),
                  isCorrect: option.startsWith("*"),
                  sortKey: index,
                })),
              },
            }
          : {}),
      },
    });
  }

  console.log(`    ${questions.length} questions on the shelves.`);
}

/**
 * Report cards for the current term, generated the way the app generates them.
 *
 * There were none, so both portals' Results pages rendered empty and nothing
 * downstream of a report card — approval, publishing, the printed PDF, a
 * guardian's access rules — could be shown working. Generation goes through
 * generateClassReportCards, the same code the Reports screen calls, so the
 * seeded cards are exactly what the app would have produced from the seeded
 * marks and registers.
 *
 * Statuses are spread deliberately: most classes published (families can see
 * them), some approved-awaiting-publication, and a few drafts carrying an AI
 * remark that no teacher has adopted — which is the state the review screen
 * exists for. The demo student's class is always published, because that is
 * the account people sign into first.
 *
 * Deterministic throughout — remarks come from score bands, statuses from the
 * section's position in the list. No RNG, so everything seeded before this
 * keeps its values.
 */
async function seedReportCards(
  terms: Array<{ id: string; sequence: number }>,
  sections: SectionRow[],
  demoStudentSectionId: string | null,
) {
  console.log("  Report cards…");

  const currentTerm = terms.find((term) => term.sequence === 2) ?? terms[0];

  let generated = 0;
  for (const section of sections) {
    const outcome = await generateClassReportCards({
      classSectionId: section.id,
      termId: currentTerm.id,
    });
    generated += outcome.generated;
    for (const error of outcome.errors) {
      console.warn(`    ! ${section.code}: ${error}`);
    }
  }

  // Remarks by performance band — what a Ghanaian form teacher actually
  // writes, chosen deterministically from the card's own average.
  const remarkFor = (average: number): { teacher: string; head: string } => {
    if (average >= 80) {
      return {
        teacher:
          "An outstanding term. Consistently excellent work across the subjects — keep this standard up.",
        head: "Excellent result. Congratulations.",
      };
    }
    if (average >= 70) {
      return {
        teacher:
          "A very good term with strong, steady work. A little more attention to revision will lift the remaining subjects.",
        head: "A very pleasing report. Keep it up.",
      };
    }
    if (average >= 60) {
      return {
        teacher:
          "Good progress this term. More consistent homework and reading at home will show quickly in the weaker subjects.",
        head: "Good work. Aim higher next term.",
      };
    }
    if (average >= 50) {
      return {
        teacher:
          "A fair term. Capable of much more with steadier effort — extra support in the core subjects is recommended.",
        head: "Has ability. Must apply it consistently.",
      };
    }
    return {
      teacher:
        "A difficult term. Please arrange a meeting with the class teacher so we can plan the right support together.",
      head: "Needs close support. See the form teacher.",
    };
  };

  const cards = await db.reportCard.findMany({
    where: { termId: currentTerm.id },
    select: { id: true, classSectionId: true, averageScore: true },
  });

  // Sections cycle through the pipeline states; the demo student's class is
  // pinned to published so the family portals have something to show.
  const stateFor = (sectionId: string): "PUBLISHED" | "APPROVED" | "DRAFT" => {
    if (sectionId === demoStudentSectionId) return "PUBLISHED";
    const index = sections.findIndex((section) => section.id === sectionId);
    if (index % 5 === 3) return "APPROVED";
    if (index % 5 === 4) return "DRAFT";
    return "PUBLISHED";
  };

  const publishedAt = addDays(new Date(), -3);

  for (const card of cards) {
    const state = stateFor(card.classSectionId);
    const average = Number(card.averageScore ?? 0);
    const remarks = remarkFor(average);

    if (state === "DRAFT") {
      // Drafts carry the AI suggestion and no adopted remark — the state the
      // review screen and the "AI draft available" badge exist to show.
      await db.reportCard.update({
        where: { id: card.id },
        data: {
          aiRemark: remarks.teacher,
        },
      });
      continue;
    }

    await db.reportCard.update({
      where: { id: card.id },
      data: {
        formTeacherRemark: remarks.teacher,
        headTeacherRemark: remarks.head,
        status: state,
        ...(state === "PUBLISHED"
          ? { publishedAt, approvedAt: addDays(publishedAt, -1) }
          : { approvedAt: addDays(new Date(), -1) }),
      },
    });
  }

  console.log(`    ${generated} report cards across ${sections.length} classes.`);
}

async function seedWebsite(school: { id: string; name: string; motto: string | null }) {
  console.log("  Public website…");

  const site = await db.site.create({
    data: {
      name: school.name,
      slug: "main",
      isPublished: true,
      // The four colours the public design derives from: links, the deep
      // brand, the warm highlight, and the wash behind soft sections.
      theme: {
        primary: "#2C66CE",
        secondary: "#0B2447",
        accent: "#E9A319",
        wash: "#FAF6EE",
        headingFont: "serif",
      },
      metaTitle: `${school.name} — Knowledge, Character, Service`,
      metaDescription:
        "Inspiring minds, shaping futures. An international school in Accra offering British and GES curricula from Nursery to JHS.",
      contactInfo: {
        email: "info@goldencrest.edu.gh",
        phone: "+233 30 212 3456",
        address: "12 Independence Avenue, Accra",
      },
      socialLinks: {
        facebook: "https://facebook.com/goldencrestgh",
        instagram: "https://instagram.com/goldencrestgh",
      },
      globals: {
        nameCaption: "International School",
        tagline: "Inspiring minds. Shaping futures. Building a better tomorrow.",
      },
      publishedAt: new Date(),
    },
  });

  // Artwork before pages, because the pages point at it.
  const art = await seedSiteArt(site.id);

  // Prop shapes match what the block editor writes and the public renderer
  // reads — flat strings, with list blocks holding "a | b" lines. Anything
  // else renders blank or breaks.
  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "Home",
      slug: "home",
      isHomePage: true,
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 0,
      blocks: [
        {
          id: "hero",
          type: "hero",
          props: {
            heading: "Inspiring Minds.",
            headingAccent: "Shaping Futures.",
            subheading:
              "A nurturing environment where students learn, grow, and thrive to become tomorrow's leaders.",
            imageUrl: art.hero ?? "",
            ctaLabel: "Discover our school",
            ctaHref: "/site/about",
            secondaryCtaLabel: "Watch video",
            secondaryCtaHref: "/site/about",
            badgeTitle: "A Legacy of Excellence",
            badgeText: "Since 2011",
          },
        },
        {
          id: "strengths",
          type: "features",
          props: {
            items: [
              "Holistic Education | Nurturing academic, emotional and social growth.",
              "Expert Educators | Passionate teachers dedicated to excellence.",
              "Innovative Learning | Modern facilities and creative teaching methods.",
              "Global Perspective | Preparing students for a global future.",
              "Safe & Supportive Campus | A secure environment where every child thrives.",
            ].join("\n"),
          },
        },
        {
          id: "about",
          type: "imageText",
          props: {
            eyebrow: "About our school",
            heading: "Excellence in Education",
            headingAccent: "Character for Life",
            body: "At Golden Crest, we believe in developing curious minds, strong values, and confident individuals ready to make a difference in the world. We run both the GES and British curricula from Nursery through JHS, in a warm and disciplined community.",
            imageUrl: art.campus ?? "",
            imagePosition: "right",
            ctaLabel: "Learn more about us",
            ctaHref: "/site/about",
            stats: [
              "14+ | Years of Excellence",
              "480+ | Happy Students",
              "100+ | Awards & Achievements",
            ].join("\n"),
            facts: [
              "15:1 | Student-Teacher Ratio",
              "30+ | Clubs & Activities",
              "12+ | Countries Represented",
            ].join("\n"),
          },
        },
        {
          id: "programmes",
          type: "cards",
          props: {
            eyebrow: "Academics",
            heading: "Discover Our Programmes",
            intro:
              "A comprehensive curriculum designed to inspire and challenge every learner.",
            items: [
              `Early Years | A nurturing start for lifelong learners. | /site/about | ${art.programmeA ?? ""} | Ages 3–5`,
              `Primary School | Building strong foundations for the future. | /site/about | ${art.programmeB ?? ""} | Basic 1–6`,
              `Junior High | Preparing leaders for the BECE and beyond. | /site/about | ${art.programmeC ?? ""} | JHS 1–3`,
              `Co-Curricular | Exploring talents beyond the classroom. | /site/about | ${art.campus ?? ""} | Clubs & Activities`,
            ].join("\n"),
            ctaLabel: "View all programmes",
            ctaHref: "/site/about",
          },
        },
        {
          id: "figures",
          type: "stats",
          props: {
            heading: "",
            items: [
              "14+ | Years of Excellence",
              "480+ | Students Enrolled",
              "38 | Qualified Teachers",
              "100+ | Awards Won",
              "98% | BECE Pass Rate",
            ].join("\n"),
          },
        },
        {
          id: "apply",
          type: "cta",
          props: {
            eyebrow: "Admissions",
            heading: "Begin Your Journey Toward a Bright Future",
            body: "Join a community where your child will be inspired, supported, and empowered to achieve their dreams.",
            imageUrl: art.admissions ?? "",
            ctaLabel: "Apply now",
            ctaHref: "/site/admissions",
            secondaryCtaLabel: "Schedule a tour",
            secondaryCtaHref: "/site/contact",
          },
        },
        {
          id: "news",
          type: "news",
          props: { eyebrow: "News & events", heading: "School News", count: "3" },
        },
      ] as never,
    },
  });

  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "About Us",
      slug: "about",
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 1,
      blocks: [
        {
          id: "story",
          type: "imageText",
          props: {
            eyebrow: "Our story",
            heading: "A School Built",
            headingAccent: "on Character",
            body: "Golden Crest opened in 2011 with thirty pupils and a conviction: that academic rigour and warmth are not opposites. Today nearly five hundred students from more than a dozen countries learn together on our Accra campus, following both the GES and British curricula from Nursery through JHS.",
            imageUrl: art.campus ?? "",
            imagePosition: "left",
            stats: ["2011 | Founded", "480+ | Students", "12+ | Nationalities"].join("\n"),
          },
        },
        {
          id: "quote",
          type: "quote",
          props: {
            quote:
              "Golden Crest did not just prepare my daughter for the BECE — it prepared her to stand in front of a room and speak her mind.",
            attribution: "Parent of a JHS 3 graduate",
          },
        },
        {
          id: "values",
          type: "cards",
          props: {
            eyebrow: "What we stand for",
            heading: "Knowledge. Character. Service.",
            items: [
              "Knowledge | Rigorous academics on two curricula, taught by specialists. | | |",
              "Character | Discipline, honesty and kindness, modelled daily. | | |",
              "Service | Every class runs a community project every term. | | |",
            ].join("\n"),
          },
        },
        {
          id: "figures",
          type: "stats",
          props: {
            heading: "",
            items: [
              "15:1 | Student-Teacher Ratio",
              "30+ | Clubs & Activities",
              "98% | BECE Pass Rate",
            ].join("\n"),
          },
        },
      ] as never,
    },
  });

  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "Admissions",
      slug: "admissions",
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 2,
      blocks: [
        {
          id: "intro",
          type: "richText",
          props: {
            eyebrow: "Admissions",
            heading: "Join the Golden Crest Family",
            body: "Applications for the next academic year are open. Entrance assessments are held monthly, and the admissions office replies to every enquiry within two school days.",
          },
        },
        {
          id: "apply",
          type: "admissionForm",
          props: {
            heading: "Apply for admission",
            intro:
              "Tell us about your child and the admissions office will be in touch within two school days.",
            levels: "Nursery\nKindergarten\nLower Primary\nUpper Primary\nJHS",
            thanks:
              "Thank you — your enquiry has been received. The admissions office will contact you shortly.",
          },
        },
      ] as never,
    },
  });

  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "Academics",
      slug: "academics",
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 3,
      blocks: [
        {
          id: "intro",
          type: "richText",
          props: {
            eyebrow: "Academics",
            heading: "A Curriculum With Two Front Doors",
            body: "Every Golden Crest student follows the Ghana Education Service curriculum and the British framework side by side, taught by subject specialists from Basic 4 upward. Small classes, weekly practical sessions, and a reading programme that starts in Nursery.",
          },
        },
        {
          id: "programmes",
          type: "cards",
          props: {
            heading: "Our Programmes",
            items: [
              `Early Years | Play-led learning that builds curiosity and confidence. | | ${art.programmeA ?? ""} | Ages 3–5`,
              `Primary School | Literacy, numeracy and science on two curricula. | | ${art.programmeB ?? ""} | Basic 1–6`,
              `Junior High | Specialist teaching toward the BECE and beyond. | | ${art.programmeC ?? ""} | JHS 1–3`,
            ].join("\n"),
          },
        },
        {
          id: "figures",
          type: "stats",
          props: {
            heading: "",
            items: [
              "15:1 | Student-Teacher Ratio",
              "98% | BECE Pass Rate",
              "2 | Curricula Offered",
              "38 | Qualified Teachers",
            ].join("\n"),
          },
        },
      ] as never,
    },
  });

  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "Campus Life",
      slug: "campus-life",
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 4,
      blocks: [
        {
          id: "intro",
          type: "richText",
          props: {
            eyebrow: "Campus life",
            heading: "More Than a Timetable",
            body: "Thirty clubs and activities run every week — robotics, debate, football, choir, chess, art. Every class runs a community project every term, and the whole school gathers for assembly on Friday mornings.",
          },
        },
        {
          id: "gallery",
          type: "gallery",
          props: {
            heading: "Around the School",
            images: [art.hero, art.campus, art.programmeA, art.programmeB, art.programmeC, art.admissions]
              .filter(Boolean)
              .join("\n"),
          },
        },
        {
          id: "quote",
          type: "quote",
          props: {
            quote:
              "My son found his people in the robotics club. He talks about school at dinner now — that never used to happen.",
            attribution: "Parent of a Basic 6 student",
          },
        },
      ] as never,
    },
  });

  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "News & Events",
      slug: "news",
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 5,
      blocks: [
        {
          id: "news",
          type: "news",
          props: { eyebrow: "News & events", heading: "The Latest", count: "6" },
        },
        {
          id: "calendar-cta",
          type: "cta",
          props: {
            eyebrow: "Term dates",
            heading: "Never miss a school day",
            body: "Term dates, holidays and events live in the parent portal's calendar, updated by the school office.",
            ctaLabel: "Open the parent portal",
            ctaHref: "/login",
          },
        },
      ] as never,
    },
  });

  await db.sitePage.create({
    data: {
      siteId: site.id,
      title: "Contact",
      slug: "contact",
      status: "PUBLISHED",
      publishedAt: new Date(),
      sortKey: 6,
      blocks: [
        {
          id: "contact",
          type: "contact",
          props: { heading: "Visit Us", hours: "Monday–Friday, 7:00am–4:30pm" },
        },
        {
          id: "apply",
          type: "cta",
          props: {
            eyebrow: "Admissions",
            heading: "Ready to see the school?",
            body: "Call the office to book a tour, or start an application from home.",
            ctaLabel: "Apply now",
            ctaHref: "/site/admissions",
          },
        },
      ] as never,
    },
  });

  // No SiteMenu row: navigation is built from the pages themselves, and a
  // menu table nothing reads is drift waiting to be reported.

  await db.sitePost.createMany({
    data: [
      {
        siteId: site.id,
        title: "Golden Crest wins regional science quiz",
        slug: "science-quiz-win",
        excerpt: "Our JHS 3 team took first place in the Greater Accra regional finals.",
        body: "Our JHS 3 science team beat eleven other schools to take first place in the regional science and maths quiz. Congratulations to the team and their coach.",
        kind: "NEWS",
        status: "PUBLISHED",
        publishedAt: addDays(new Date(), -6),
        authorName: "School Office",
      },
      {
        siteId: site.id,
        title: "New science laboratory opens",
        slug: "new-science-lab",
        excerpt: "A fully equipped laboratory for JHS practical work.",
        body: "The new laboratory was commissioned this term and gives every JHS student weekly practical sessions in physics, chemistry and biology.",
        kind: "NEWS",
        status: "PUBLISHED",
        publishedAt: addDays(new Date(), -20),
        authorName: "School Office",
      },
    ],
  });

  await seedBranding(school, site.id);
}

// -----------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function printCredentials() {
  const rows = [
    ["System Administrator", process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu.gh", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"],
    ["Head Teacher", "head@goldencrest.edu.gh", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"],
    ["Bursar", "bursar@goldencrest.edu.gh", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"],
    ["Form Teacher", "teacher@goldencrest.edu.gh", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"],
    ["Registrar", "registrar@goldencrest.edu.gh", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"],
    ["School Nurse", "nurse@goldencrest.edu.gh", process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"],
    ["Parent / Guardian", "parent@goldencrest.edu.gh", "Parent123!"],
    ["Student", "student@goldencrest.edu.gh", "Student123!"],
  ];

  console.log("  Sign-in accounts");
  console.log("  " + "─".repeat(74));
  for (const [role, email, password] of rows) {
    console.log(`  ${role.padEnd(24)} ${email.padEnd(34)} ${password}`);
  }
  console.log("  " + "─".repeat(74));

  // Name the person behind the demo student login, and the class their course
  // material was seeded into — the two things you need to know before clicking
  // anything in the portal.
  const demo = await db.user.findFirst({
    where: { email: "student@goldencrest.edu.gh" },
    select: {
      student: {
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (demo?.student) {
    const section = demo.student.enrollments[0]?.classSection;
    console.log(
      `\n  Student portal is ${demo.student.firstName} ${demo.student.lastName} (${demo.student.admissionNo})` +
        (section ? ` in ${section.classLevel.name} ${section.name}` : "") +
        `\n  Courses and quizzes were seeded into that class.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("\nSeed failed:\n", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
