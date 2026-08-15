-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PortalType" AS ENUM ('STAFF', 'STUDENT', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('APPLICANT', 'OFFERED', 'ENROLLED', 'ON_LEAVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED_OUT', 'WITHDRAWN', 'ALUMNI');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'NATIONAL_SERVICE', 'INTERN', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "TermType" AS ENUM ('TERM', 'SEMESTER');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'REPEATED', 'WITHDRAWN', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'SICK', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "AttendanceSessionType" AS ENUM ('DAILY', 'MORNING', 'AFTERNOON', 'PERIOD', 'ACTIVITY', 'BOARDING');

-- CreateEnum
CREATE TYPE "AssessmentCategory" AS ENUM ('CLASSWORK', 'HOMEWORK', 'QUIZ', 'TEST', 'PROJECT', 'PRACTICAL', 'PRESENTATION', 'MIDTERM', 'EXAM', 'MOCK', 'PARTICIPATION');

-- CreateEnum
CREATE TYPE "ReportCardStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'USSD', 'CASH', 'CHEQUE', 'POS', 'WALLET', 'SCHOLARSHIP');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'HUBTEL', 'FLUTTERWAVE', 'MANUAL', 'MOCK');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'READ', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemoStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ISSUED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'NOMINATIONS_OPEN', 'NOMINATIONS_CLOSED', 'SCHEDULED', 'OPEN', 'CLOSED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NOMINATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'RICHTEXT', 'NUMBER', 'DECIMAL', 'CURRENCY', 'DATE', 'DATETIME', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'EMAIL', 'PHONE', 'URL', 'FILE');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('STUDENT', 'STAFF', 'GUARDIAN', 'ENROLLMENT', 'INVOICE', 'PAYMENT', 'DOCUMENT', 'ELECTION', 'COURSE', 'APPLICATION');

-- CreateEnum
CREATE TYPE "RelationKind" AS ENUM ('FATHER', 'MOTHER', 'STEP_FATHER', 'STEP_MOTHER', 'GUARDIAN', 'GRANDFATHER', 'GRANDMOTHER', 'UNCLE', 'AUNT', 'BROTHER', 'SISTER', 'COUSIN', 'SPONSOR', 'OTHER');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('FILE_UPLOAD', 'TEXT_ENTRY', 'QUIZ', 'OFFLINE', 'LINK');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED', 'RESUBMIT');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'MULTIPLE_ANSWER', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'MATCHING', 'FILL_BLANK');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiInsightKind" AS ENUM ('STUDENT_PROGRESS', 'CLASS_PERFORMANCE', 'TEACHING_EFFECTIVENESS', 'ATTENDANCE_PATTERN', 'FINANCE_HEALTH', 'MANAGEMENT_BRIEF', 'CUSTOM_REPORT', 'REPORT_CARD_REMARK', 'AT_RISK_SCAN');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('PRIVATE', 'ROLE_RESTRICTED', 'STAFF', 'SCHOOL_WIDE', 'PUBLIC');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "motto" TEXT,
    "logoUrl" TEXT,
    "crestUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT DEFAULT 'Accra',
    "region" TEXT DEFAULT 'Greater Accra',
    "digitalAddr" TEXT,
    "postalBox" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "locale" TEXT NOT NULL DEFAULT 'en-GH',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "academicModel" "TermType" NOT NULL DEFAULT 'TERM',
    "curricula" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "registrationNo" TEXT,
    "taxId" TEXT,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "resultsDueDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "audiences" "PortalType"[] DEFAULT ARRAY['STAFF', 'STUDENT', 'GUARDIAN']::"PortalType"[],
    "colour" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "label" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionSet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "entity" "EntityType",
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "allowCustom" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionItem" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colour" TEXT,
    "icon" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "OptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDef" (
    "id" TEXT NOT NULL,
    "entity" "EntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "helpText" TEXT,
    "placeholder" TEXT,
    "section" TEXT NOT NULL DEFAULT 'Additional Information',
    "optionSetId" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "showInList" BOOLEAN NOT NULL DEFAULT false,
    "showInPortal" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validation" JSONB,
    "defaultValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "entity" "EntityType" NOT NULL,
    "recordId" TEXT NOT NULL,
    "value" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "avatarUrl" TEXT,
    "portal" "PortalType" NOT NULL DEFAULT 'STAFF',
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'en-GH',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "portal" "PortalType" NOT NULL DEFAULT 'STAFF',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "target" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "summary" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "campusId" TEXT,
    "staffNo" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "dateOfBirth" TIMESTAMP(3),
    "photoUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "address" TEXT,
    "digitalAddr" TEXT,
    "nationality" TEXT DEFAULT 'Ghanaian',
    "nationalId" TEXT,
    "ssnitNumber" TEXT,
    "tin" TEXT,
    "maritalStatus" TEXT,
    "religion" TEXT,
    "bloodGroup" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3),
    "confirmDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "qualifications" JSONB,
    "specialisations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankAccountNo" TEXT,
    "momoNumber" TEXT,
    "momoNetwork" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "emergencyRelation" TEXT,
    "isTeaching" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLeave" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "campusId" TEXT,
    "admissionNo" TEXT NOT NULL,
    "indexNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "preferredName" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "dateOfBirth" TIMESTAMP(3),
    "placeOfBirth" TEXT,
    "photoUrl" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ENROLLED',
    "nationality" TEXT DEFAULT 'Ghanaian',
    "secondNationality" TEXT,
    "nationalId" TEXT,
    "passportNo" TEXT,
    "birthCertNo" TEXT,
    "nhisNumber" TEXT,
    "ethnicity" TEXT,
    "hometown" TEXT,
    "homeRegion" TEXT,
    "religion" TEXT,
    "denomination" TEXT,
    "firstLanguage" TEXT DEFAULT 'English',
    "otherLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "phone" TEXT,
    "residentialAddress" TEXT,
    "postalAddress" TEXT,
    "digitalAddr" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT DEFAULT 'Ghana',
    "livingWith" TEXT,
    "householdSize" INTEGER,
    "birthOrder" INTEGER,
    "numberOfSiblings" INTEGER,
    "parentMaritalStatus" TEXT,
    "isOrphan" BOOLEAN NOT NULL DEFAULT false,
    "isSingleParent" BOOLEAN NOT NULL DEFAULT false,
    "onScholarship" BOOLEAN NOT NULL DEFAULT false,
    "scholarshipDetails" TEXT,
    "distanceToSchoolKm" DECIMAL(6,2),
    "transportMode" TEXT,
    "busRoute" TEXT,
    "internetAtHome" BOOLEAN,
    "deviceAccess" TEXT,
    "specialCircumstances" TEXT,
    "isBoarder" BOOLEAN NOT NULL DEFAULT false,
    "house" TEXT,
    "dormitory" TEXT,
    "roomNumber" TEXT,
    "hasSpecialNeeds" BOOLEAN NOT NULL DEFAULT false,
    "specialNeedsNotes" TEXT,
    "learningSupport" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "giftedTalented" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "admissionDate" TIMESTAMP(3),
    "admittedIntoLevel" TEXT,
    "admissionType" TEXT,
    "referralSource" TEXT,
    "exitDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "transferredTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentMedical" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bloodGroup" TEXT,
    "genotype" TEXT,
    "heightCm" DECIMAL(5,2),
    "weightKg" DECIMAL(5,2),
    "lastCheckup" TIMESTAMP(3),
    "allergies" JSONB,
    "conditions" JSONB,
    "medications" JSONB,
    "immunisations" JSONB,
    "surgeries" JSONB,
    "dietaryRestrictions" TEXT,
    "visionNotes" TEXT,
    "hearingNotes" TEXT,
    "mobilityNotes" TEXT,
    "mentalHealthNotes" TEXT,
    "doctorName" TEXT,
    "doctorPhone" TEXT,
    "hospitalName" TEXT,
    "hospitalAddress" TEXT,
    "insuranceProvider" TEXT,
    "insuranceNumber" TEXT,
    "nhisNumber" TEXT,
    "consentToTreat" BOOLEAN NOT NULL DEFAULT false,
    "consentSignedBy" TEXT,
    "consentSignedAt" TIMESTAMP(3),
    "emergencyInstructions" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "StudentMedical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicVisit" (
    "id" TEXT NOT NULL,
    "medicalId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complaint" TEXT NOT NULL,
    "temperature" DECIMAL(4,1),
    "treatment" TEXT,
    "medicationGiven" TEXT,
    "outcome" TEXT,
    "attendedBy" TEXT,
    "guardianNotified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "ClinicVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "dateOfBirth" TIMESTAMP(3),
    "photoUrl" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "digitalAddr" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Ghana',
    "nationality" TEXT DEFAULT 'Ghanaian',
    "nationalId" TEXT,
    "occupation" TEXT,
    "employer" TEXT,
    "workAddress" TEXT,
    "workPhone" TEXT,
    "jobTitle" TEXT,
    "incomeBand" TEXT,
    "educationLevel" TEXT,
    "religion" TEXT,
    "preferredChannel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "isAlumni" BOOLEAN NOT NULL DEFAULT false,
    "isPtaMember" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGuardian" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relation" "RelationKind" NOT NULL DEFAULT 'GUARDIAN',
    "relationLabel" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isBillPayer" BOOLEAN NOT NULL DEFAULT false,
    "billSharePercent" INTEGER NOT NULL DEFAULT 0,
    "canPickUp" BOOLEAN NOT NULL DEFAULT true,
    "hasCustody" BOOLEAN NOT NULL DEFAULT true,
    "receivesReports" BOOLEAN NOT NULL DEFAULT true,
    "livesWithStudent" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyRelation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "relatedStudentId" TEXT,
    "relation" "RelationKind" NOT NULL,
    "relationLabel" TEXT,
    "generation" INTEGER NOT NULL DEFAULT -1,
    "lineage" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "isDeceased" BOOLEAN NOT NULL DEFAULT false,
    "occupation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isAlumnus" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducationHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "schoolType" TEXT,
    "country" TEXT DEFAULT 'Ghana',
    "city" TEXT,
    "curriculum" TEXT,
    "levelFrom" TEXT,
    "levelTo" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "reasonForLeaving" TEXT,
    "lastPosition" TEXT,
    "lastAverage" DECIMAL(5,2),
    "conduct" TEXT,
    "examResults" JSONB,
    "hasTranscript" BOOLEAN NOT NULL DEFAULT false,
    "transcriptFileId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EducationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "incidentAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MINOR',
    "description" TEXT NOT NULL,
    "location" TEXT,
    "witnesses" TEXT,
    "actionTaken" TEXT,
    "sanction" TEXT,
    "suspensionDays" INTEGER,
    "reportedBy" TEXT,
    "handledBy" TEXT,
    "guardianNotified" BOOLEAN NOT NULL DEFAULT false,
    "guardianNotifiedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplinaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassLevel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT,
    "curriculum" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClassLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSection" (
    "id" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stream" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "roomName" TEXT,
    "formTeacherId" TEXT,
    "assistantTeacherId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shortName" TEXT,
    "department" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "isElective" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromAggregate" BOOLEAN NOT NULL DEFAULT false,
    "creditHours" DECIMAL(4,1),
    "passMark" INTEGER NOT NULL DEFAULT 50,
    "colour" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelSubject" (
    "id" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "isCompulsory" BOOLEAN NOT NULL DEFAULT true,
    "periodsPerWeek" INTEGER,

    CONSTRAINT "LevelSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectOffering" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "subjectId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "teacherId" TEXT,
    "coTeacherIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "room" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "offeringId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "label" TEXT,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "rollNumber" INTEGER,
    "enrolledOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" TIMESTAMP(3),
    "electiveSubjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "fromSectionId" TEXT,
    "toSectionId" TEXT,
    "decision" TEXT NOT NULL,
    "averageScore" DECIMAL(5,2),
    "reason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "offeringId" TEXT,
    "date" DATE NOT NULL,
    "type" "AttendanceSessionType" NOT NULL DEFAULT 'DAILY',
    "periodIndex" INTEGER,
    "takenById" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "minutesLate" INTEGER,
    "reason" TEXT,
    "excuseNote" TEXT,
    "excuseFileId" TEXT,
    "guardianNotified" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeScale" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "maxPoint" DECIMAL(4,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GradeScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minScore" DECIMAL(5,2) NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL,
    "point" DECIMAL(4,2),
    "remark" TEXT,
    "interpretation" TEXT,
    "colour" TEXT,
    "isPass" BOOLEAN NOT NULL DEFAULT true,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "AssessmentCategory" NOT NULL DEFAULT 'TEST',
    "maxScore" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isExam" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "conductedOn" TIMESTAMP(3),
    "instructions" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentScore" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCard" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "gradeScaleId" TEXT,
    "totalScore" DECIMAL(8,2),
    "averageScore" DECIMAL(5,2),
    "gpa" DECIMAL(4,2),
    "aggregate" INTEGER,
    "overallGrade" TEXT,
    "positionInClass" INTEGER,
    "classSize" INTEGER,
    "positionInLevel" INTEGER,
    "daysPresent" INTEGER,
    "daysAbsent" INTEGER,
    "daysLate" INTEGER,
    "totalSchoolDays" INTEGER,
    "conduct" TEXT,
    "attitude" TEXT,
    "interest" TEXT,
    "activities" TEXT,
    "formTeacherRemark" TEXT,
    "headTeacherRemark" TEXT,
    "aiRemark" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "nextTermBegins" TIMESTAMP(3),
    "status" "ReportCardStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardLine" (
    "id" TEXT NOT NULL,
    "reportCardId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "caScore" DECIMAL(6,2),
    "examScore" DECIMAL(6,2),
    "totalScore" DECIMAL(6,2),
    "grade" TEXT,
    "point" DECIMAL(4,2),
    "position" INTEGER,
    "classAverage" DECIMAL(5,2),
    "highestScore" DECIMAL(6,2),
    "lowestScore" DECIMAL(6,2),
    "remark" TEXT,
    "teacherName" TEXT,
    "breakdown" JSONB,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportCardLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'BUILDER',
    "fileId" TEXT,
    "layout" JSONB,
    "bindings" JSONB,
    "pageSize" TEXT NOT NULL DEFAULT 'A4',
    "orientation" TEXT NOT NULL DEFAULT 'PORTRAIT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "templateId" TEXT,
    "serialNumber" TEXT NOT NULL,
    "purpose" TEXT,
    "issuedTo" TEXT,
    "snapshot" JSONB NOT NULL,
    "cumulativeGpa" DECIMAL(4,2),
    "totalCredits" DECIMAL(6,1),
    "classification" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "fileId" TEXT,
    "verifyCode" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptLine" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "subjectId" TEXT,
    "academicYear" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "grade" TEXT,
    "point" DECIMAL(4,2),
    "credits" DECIMAL(4,1),
    "remark" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TranscriptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedCertificate" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "templateId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "awardedFor" TEXT,
    "data" JSONB,
    "issuedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresOn" TIMESTAMP(3),
    "fileId" TEXT,
    "verifyCode" TEXT NOT NULL,
    "signedBy" TEXT,
    "signatoryTitle" TEXT,
    "issuedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "IssuedCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "glCode" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FeeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "classLevelId" TEXT,
    "name" TEXT NOT NULL,
    "boarderType" TEXT,
    "studentType" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "dueDate" TIMESTAMP(3),
    "minimumFirstPaymentMinor" INTEGER,
    "notes" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructureItem" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeeStructureItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "title" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "terms" TEXT,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "amountMinor" INTEGER NOT NULL,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDiscount" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" INTEGER NOT NULL,
    "categoryId" TEXT,
    "academicYearId" TEXT,
    "reason" TEXT,
    "sponsorName" TEXT,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "sequence" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remindersSent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "receiptNo" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "channel" "PaymentChannel" NOT NULL DEFAULT 'CASH',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCESS',
    "reference" TEXT NOT NULL,
    "providerReference" TEXT,
    "providerPayload" JSONB,
    "authorizationUrl" TEXT,
    "momoNetwork" TEXT,
    "momoNumber" TEXT,
    "cardLast4" TEXT,
    "cardBrand" TEXT,
    "bankName" TEXT,
    "bankReference" TEXT,
    "ussdCode" TEXT,
    "chequeNumber" TEXT,
    "payerName" TEXT,
    "payerPhone" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "narration" TEXT,
    "receivedById" TEXT,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedBy" TEXT,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "repeatEveryDays" INTEGER NOT NULL DEFAULT 0,
    "maxReminders" INTEGER NOT NULL DEFAULT 3,
    "minBalanceMinor" INTEGER NOT NULL DEFAULT 0,
    "channels" "MessageChannel"[] DEFAULT ARRAY['SMS', 'EMAIL', 'PUSH']::"MessageChannel"[],
    "audience" TEXT NOT NULL DEFAULT 'BILL_PAYERS',
    "templateId" TEXT,
    "sendAfterHour" INTEGER NOT NULL DEFAULT 7,
    "sendBeforeHour" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeReminder" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ruleId" TEXT,
    "kind" TEXT NOT NULL,
    "channels" "MessageChannel"[] DEFAULT ARRAY[]::"MessageChannel"[],
    "balanceAtSendMinor" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT,

    CONSTRAINT "FeeReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "channels" "MessageChannel"[] DEFAULT ARRAY[]::"MessageChannel"[],
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "smsBody" TEXT,
    "pushTitle" TEXT,
    "pushBody" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "audiences" "PortalType"[] DEFAULT ARRAY[]::"PortalType"[],
    "targetRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetClassIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetLevelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" "MessageChannel"[] DEFAULT ARRAY['IN_APP']::"MessageChannel"[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "bannerImageUrl" TEXT,
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementAttachment" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "AnnouncementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INTERNAL',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "MemoStatus" NOT NULL DEFAULT 'DRAFT',
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "fromDepartment" TEXT,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "ackDeadline" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "authorId" TEXT,
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoRecipient" (
    "id" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TO',
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "ackComment" TEXT,

    CONSTRAINT "MemoRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoAttachment" (
    "id" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "MemoAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationJob" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "templateId" TEXT,
    "announcementId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "audienceFilter" JSONB,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMinor" INTEGER NOT NULL DEFAULT 0,
    "actualCostMinor" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationRecipient" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "destination" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "renderedBody" TEXT,
    "providerMessageId" TEXT,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "CommunicationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DIRECT',
    "studentId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "icon" TEXT,
    "url" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "thumbnailUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "pageCount" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "colour" TEXT,
    "path" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'STAFF',
    "allowedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "reference" TEXT,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'STAFF',
    "allowedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "retentionDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'SRC',
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "nominationOpensAt" TIMESTAMP(3),
    "nominationClosesAt" TIMESTAMP(3),
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "resultsPublishedAt" TIMESTAMP(3),
    "eligiblePortals" "PortalType"[] DEFAULT ARRAY['STUDENT']::"PortalType"[],
    "eligibleClassIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eligibleLevelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eligibleRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSecret" BOOLEAN NOT NULL DEFAULT true,
    "showLiveResults" BOOLEAN NOT NULL DEFAULT true,
    "requireOtp" BOOLEAN NOT NULL DEFAULT false,
    "allowAbstain" BOOLEAN NOT NULL DEFAULT true,
    "bannerImageUrl" TEXT,
    "instructions" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionPosition" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "classSectionId" TEXT,
    "classLevelId" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ElectionPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "slogan" TEXT,
    "manifesto" TEXT,
    "ballotOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CandidateStatus" NOT NULL DEFAULT 'APPROVED',
    "rejectionReason" TEXT,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterRoll" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hasVoted" BOOLEAN NOT NULL DEFAULT false,
    "votedAt" TIMESTAMP(3),
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VoterRoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "userId" TEXT,
    "receiptCode" TEXT NOT NULL,
    "castAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "ballotId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "candidateId" TEXT,
    "isAbstention" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isSelfPaced" BOOLEAN NOT NULL DEFAULT false,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "enforceSequence" BOOLEAN NOT NULL DEFAULT false,
    "allowDiscussion" BOOLEAN NOT NULL DEFAULT true,
    "syllabus" TEXT,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "unlocksOn" TIMESTAMP(3),

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "videoUrl" TEXT,
    "externalUrl" TEXT,
    "durationMinutes" INTEGER,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "fileId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "secondsSpent" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "type" "AssignmentType" NOT NULL DEFAULT 'FILE_UPLOAD',
    "maxScore" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "allowLate" BOOLEAN NOT NULL DEFAULT true,
    "latePenaltyPercent" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "rubric" JSONB,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "textBody" TEXT,
    "linkUrl" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "score" DECIMAL(6,2),
    "gradeLabel" TEXT,
    "feedback" TEXT,
    "aiFeedback" TEXT,
    "rubricScores" JSONB,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timeLimitMinutes" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "passMark" INTEGER NOT NULL DEFAULT 50,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
    "showAnswersAfter" TEXT NOT NULL DEFAULT 'AFTER_CLOSE',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "prompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "points" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "acceptedAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "explanation" TEXT,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DECIMAL(6,2),
    "maxScore" DECIMAL(6,2),
    "percent" DECIMAL(5,2),
    "passed" BOOLEAN,
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT,
    "optionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "pointsAwarded" DECIMAL(5,2),
    "feedback" TEXT,

    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionThread" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPost" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "isAnswer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MEET',
    "joinUrl" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "recordingUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "slug" TEXT NOT NULL DEFAULT 'main',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "theme" JSONB,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "globals" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "googleAnalyticsId" TEXT,
    "customCss" TEXT,
    "customHeadHtml" TEXT,
    "socialLinks" JSONB,
    "contactInfo" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "isHomePage" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMenu" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'HEADER',
    "items" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SiteMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMedia" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "altText" TEXT,
    "caption" TEXT,
    "folder" TEXT DEFAULT 'uncategorised',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transforms" JSONB,
    "renderedUrl" TEXT,
    "focalX" DECIMAL(5,4),
    "focalY" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePost" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NEWS',
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "authorName" TEXT,
    "eventStartsAt" TIMESTAMP(3),
    "eventEndsAt" TIMESTAMP(3),
    "eventLocation" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteFormSubmission" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "ipAddress" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataset" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "chartType" TEXT,
    "includeAiInsights" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sharedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT,
    "deliverTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT,
    "name" TEXT NOT NULL,
    "parameters" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "aiNarrative" TEXT,
    "fileId" TEXT,
    "format" TEXT NOT NULL DEFAULT 'TABLE',
    "error" TEXT,
    "durationMs" INTEGER,
    "runById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "kind" "AiInsightKind" NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "findings" JSONB,
    "actions" JSONB,
    "inputData" JSONB,
    "model" TEXT,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMinor" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "ratingNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataJob" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'XLSX',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "fileId" TEXT,
    "resultFileId" TEXT,
    "mapping" JSONB,
    "options" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campus_schoolId_code_key" ON "Campus"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Term_academicYearId_sequence_key" ON "Term"("academicYearId", "sequence");

-- CreateIndex
CREATE INDEX "CalendarEvent_startsAt_idx" ON "CalendarEvent"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_group_key_key" ON "Setting"("group", "key");

-- CreateIndex
CREATE UNIQUE INDEX "OptionSet_key_key" ON "OptionSet"("key");

-- CreateIndex
CREATE INDEX "OptionItem_setId_sortKey_idx" ON "OptionItem"("setId", "sortKey");

-- CreateIndex
CREATE UNIQUE INDEX "OptionItem_setId_value_key" ON "OptionItem"("setId", "value");

-- CreateIndex
CREATE INDEX "CustomFieldDef_entity_sortKey_idx" ON "CustomFieldDef"("entity", "sortKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDef_entity_key_key" ON "CustomFieldDef"("entity", "key");

-- CreateIndex
CREATE INDEX "CustomFieldValue_entity_recordId_idx" ON "CustomFieldValue"("entity", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_fieldId_recordId_key" ON "CustomFieldValue"("fieldId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_portal_idx" ON "User"("portal");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_module_idx" ON "Permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_purpose_idx" ON "VerificationToken"("purpose");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_staffNo_key" ON "Staff"("staffNo");

-- CreateIndex
CREATE INDEX "Staff_status_idx" ON "Staff"("status");

-- CreateIndex
CREATE INDEX "Staff_department_idx" ON "Staff"("department");

-- CreateIndex
CREATE INDEX "Staff_lastName_firstName_idx" ON "Staff"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "StaffLeave_staffId_startDate_idx" ON "StaffLeave"("staffId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_admissionNo_key" ON "Student"("admissionNo");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "Student_lastName_firstName_idx" ON "Student"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Student_admissionNo_idx" ON "Student"("admissionNo");

-- CreateIndex
CREATE UNIQUE INDEX "StudentMedical_studentId_key" ON "StudentMedical"("studentId");

-- CreateIndex
CREATE INDEX "ClinicVisit_medicalId_visitedAt_idx" ON "ClinicVisit"("medicalId", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_userId_key" ON "Guardian"("userId");

-- CreateIndex
CREATE INDEX "Guardian_lastName_firstName_idx" ON "Guardian"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Guardian_phone_idx" ON "Guardian"("phone");

-- CreateIndex
CREATE INDEX "StudentGuardian_guardianId_idx" ON "StudentGuardian"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardian_studentId_guardianId_key" ON "StudentGuardian"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "FamilyRelation_studentId_idx" ON "FamilyRelation"("studentId");

-- CreateIndex
CREATE INDEX "FamilyRelation_relatedStudentId_idx" ON "FamilyRelation"("relatedStudentId");

-- CreateIndex
CREATE INDEX "EducationHistory_studentId_idx" ON "EducationHistory"("studentId");

-- CreateIndex
CREATE INDEX "StudentDocument_studentId_category_idx" ON "StudentDocument"("studentId", "category");

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_studentId_incidentAt_idx" ON "DisciplinaryRecord"("studentId", "incidentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClassLevel_code_key" ON "ClassLevel"("code");

-- CreateIndex
CREATE INDEX "ClassLevel_sequence_idx" ON "ClassLevel"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_code_key" ON "ClassSection"("code");

-- CreateIndex
CREATE INDEX "ClassSection_classLevelId_idx" ON "ClassSection"("classLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");

-- CreateIndex
CREATE INDEX "Subject_department_idx" ON "Subject"("department");

-- CreateIndex
CREATE UNIQUE INDEX "LevelSubject_classLevelId_subjectId_key" ON "LevelSubject"("classLevelId", "subjectId");

-- CreateIndex
CREATE INDEX "SubjectOffering_teacherId_idx" ON "SubjectOffering"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectOffering_academicYearId_termId_subjectId_classSectio_key" ON "SubjectOffering"("academicYearId", "termId", "subjectId", "classSectionId");

-- CreateIndex
CREATE INDEX "TimetableSlot_offeringId_idx" ON "TimetableSlot"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_classSectionId_dayOfWeek_periodIndex_key" ON "TimetableSlot"("classSectionId", "dayOfWeek", "periodIndex");

-- CreateIndex
CREATE INDEX "Enrollment_classSectionId_idx" ON "Enrollment"("classSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_academicYearId_key" ON "Enrollment"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "PromotionRecord_studentId_idx" ON "PromotionRecord"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceSession_date_idx" ON "AttendanceSession"("date");

-- CreateIndex
CREATE INDEX "AttendanceSession_termId_idx" ON "AttendanceSession"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSession_classSectionId_date_type_periodIndex_key" ON "AttendanceSession"("classSectionId", "date", "type", "periodIndex");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_status_idx" ON "AttendanceRecord"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_sessionId_studentId_key" ON "AttendanceRecord"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeScale_code_key" ON "GradeScale"("code");

-- CreateIndex
CREATE INDEX "GradeBand_scaleId_sortKey_idx" ON "GradeBand"("scaleId", "sortKey");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_scaleId_grade_key" ON "GradeBand"("scaleId", "grade");

-- CreateIndex
CREATE INDEX "Assessment_offeringId_idx" ON "Assessment"("offeringId");

-- CreateIndex
CREATE INDEX "Assessment_termId_idx" ON "Assessment"("termId");

-- CreateIndex
CREATE INDEX "AssessmentScore_studentId_idx" ON "AssessmentScore"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentScore_assessmentId_studentId_key" ON "AssessmentScore"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "ReportCard_classSectionId_termId_idx" ON "ReportCard"("classSectionId", "termId");

-- CreateIndex
CREATE INDEX "ReportCard_status_idx" ON "ReportCard"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCard_studentId_termId_key" ON "ReportCard"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardLine_reportCardId_subjectId_key" ON "ReportCardLine"("reportCardId", "subjectId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_kind_idx" ON "DocumentTemplate"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_serialNumber_key" ON "Transcript"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_verifyCode_key" ON "Transcript"("verifyCode");

-- CreateIndex
CREATE INDEX "Transcript_studentId_idx" ON "Transcript"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCertificate_serialNumber_key" ON "IssuedCertificate"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCertificate_verifyCode_key" ON "IssuedCertificate"("verifyCode");

-- CreateIndex
CREATE INDEX "IssuedCertificate_studentId_idx" ON "IssuedCertificate"("studentId");

-- CreateIndex
CREATE INDEX "IssuedCertificate_kind_idx" ON "IssuedCertificate"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "FeeCategory_code_key" ON "FeeCategory"("code");

-- CreateIndex
CREATE INDEX "FeeStructure_academicYearId_termId_idx" ON "FeeStructure"("academicYearId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructureItem_structureId_categoryId_key" ON "FeeStructureItem"("structureId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_studentId_status_idx" ON "Invoice"("studentId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_academicYearId_termId_idx" ON "Invoice"("academicYearId", "termId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "StudentDiscount_studentId_isActive_idx" ON "StudentDiscount"("studentId", "isActive");

-- CreateIndex
CREATE INDEX "PaymentPlan_studentId_idx" ON "PaymentPlan"("studentId");

-- CreateIndex
CREATE INDEX "Installment_dueDate_status_idx" ON "Installment"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_planId_sequence_key" ON "Installment"("planId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_studentId_status_idx" ON "Payment"("studentId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_provider_providerReference_idx" ON "Payment"("provider", "providerReference");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "FeeReminder_invoiceId_sentAt_idx" ON "FeeReminder"("invoiceId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_key_key" ON "MessageTemplate"("key");

-- CreateIndex
CREATE INDEX "Announcement_status_publishAt_idx" ON "Announcement"("status", "publishAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementAttachment_announcementId_fileId_key" ON "AnnouncementAttachment"("announcementId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_referenceNo_key" ON "Memo"("referenceNo");

-- CreateIndex
CREATE INDEX "Memo_status_idx" ON "Memo"("status");

-- CreateIndex
CREATE INDEX "MemoRecipient_userId_idx" ON "MemoRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoRecipient_memoId_userId_key" ON "MemoRecipient"("memoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoAttachment_memoId_fileId_key" ON "MemoAttachment"("memoId", "fileId");

-- CreateIndex
CREATE INDEX "CommunicationJob_status_scheduledAt_idx" ON "CommunicationJob"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_jobId_status_idx" ON "CommunicationRecipient"("jobId", "status");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_userId_idx" ON "CommunicationRecipient"("userId");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_channel_key" ON "NotificationPreference"("userId", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_mimeType_idx" ON "FileAsset"("mimeType");

-- CreateIndex
CREATE INDEX "DocumentFolder_path_idx" ON "DocumentFolder"("path");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFolder_parentId_slug_key" ON "DocumentFolder"("parentId", "slug");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "Document_tags_idx" ON "Document"("tags");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_documentId_createdAt_idx" ON "DocumentAccessLog"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Election_slug_key" ON "Election"("slug");

-- CreateIndex
CREATE INDEX "Election_status_opensAt_idx" ON "Election"("status", "opensAt");

-- CreateIndex
CREATE INDEX "ElectionPosition_electionId_sortKey_idx" ON "ElectionPosition"("electionId", "sortKey");

-- CreateIndex
CREATE INDEX "Candidate_positionId_ballotOrder_idx" ON "Candidate"("positionId", "ballotOrder");

-- CreateIndex
CREATE INDEX "VoterRoll_electionId_hasVoted_idx" ON "VoterRoll"("electionId", "hasVoted");

-- CreateIndex
CREATE UNIQUE INDEX "VoterRoll_electionId_userId_key" ON "VoterRoll"("electionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_receiptCode_key" ON "Ballot"("receiptCode");

-- CreateIndex
CREATE INDEX "Ballot_electionId_idx" ON "Ballot"("electionId");

-- CreateIndex
CREATE INDEX "Vote_positionId_candidateId_idx" ON "Vote"("positionId", "candidateId");

-- CreateIndex
CREATE INDEX "Vote_ballotId_idx" ON "Vote"("ballotId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_offeringId_key" ON "Course"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_sortKey_idx" ON "CourseModule"("courseId", "sortKey");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_sortKey_idx" ON "Lesson"("moduleId", "sortKey");

-- CreateIndex
CREATE INDEX "LessonProgress_studentId_idx" ON "LessonProgress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_lessonId_studentId_key" ON "LessonProgress"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "Assignment_courseId_dueAt_idx" ON "Assignment"("courseId", "dueAt");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_attempt_key" ON "Submission"("assignmentId", "studentId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionFile_submissionId_fileId_key" ON "SubmissionFile"("submissionId", "fileId");

-- CreateIndex
CREATE INDEX "Quiz_courseId_idx" ON "Quiz"("courseId");

-- CreateIndex
CREATE INDEX "QuizQuestion_quizId_sortKey_idx" ON "QuizQuestion"("quizId", "sortKey");

-- CreateIndex
CREATE INDEX "QuizAttempt_studentId_idx" ON "QuizAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_quizId_studentId_attempt_key" ON "QuizAttempt"("quizId", "studentId", "attempt");

-- CreateIndex
CREATE INDEX "QuizAnswer_attemptId_idx" ON "QuizAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "DiscussionThread_courseId_updatedAt_idx" ON "DiscussionThread"("courseId", "updatedAt");

-- CreateIndex
CREATE INDEX "DiscussionPost_threadId_createdAt_idx" ON "DiscussionPost"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveSession_courseId_startsAt_idx" ON "LiveSession"("courseId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Site_domain_key" ON "Site"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Site_slug_key" ON "Site"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_siteId_slug_key" ON "SitePage"("siteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SiteMenu_siteId_location_key" ON "SiteMenu"("siteId", "location");

-- CreateIndex
CREATE INDEX "SiteMedia_siteId_folder_idx" ON "SiteMedia"("siteId", "folder");

-- CreateIndex
CREATE INDEX "SitePost_siteId_status_publishedAt_idx" ON "SitePost"("siteId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SitePost_siteId_slug_key" ON "SitePost"("siteId", "slug");

-- CreateIndex
CREATE INDEX "SiteFormSubmission_siteId_formKey_createdAt_idx" ON "SiteFormSubmission"("siteId", "formKey", "createdAt");

-- CreateIndex
CREATE INDEX "ReportDefinition_dataset_idx" ON "ReportDefinition"("dataset");

-- CreateIndex
CREATE INDEX "ReportRun_definitionId_createdAt_idx" ON "ReportRun"("definitionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_kind_scopeId_idx" ON "AiInsight"("kind", "scopeId");

-- CreateIndex
CREATE INDEX "AiInsight_createdAt_idx" ON "AiInsight"("createdAt");

-- CreateIndex
CREATE INDEX "DataJob_entity_status_idx" ON "DataJob"("entity", "status");

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "OptionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeave" ADD CONSTRAINT "StaffLeave_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMedical" ADD CONSTRAINT "StudentMedical_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicVisit" ADD CONSTRAINT "ClinicVisit_medicalId_fkey" FOREIGN KEY ("medicalId") REFERENCES "StudentMedical"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelation" ADD CONSTRAINT "FamilyRelation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelation" ADD CONSTRAINT "FamilyRelation_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducationHistory" ADD CONSTRAINT "EducationHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryRecord" ADD CONSTRAINT "DisciplinaryRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_formTeacherId_fkey" FOREIGN KEY ("formTeacherId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_assistantTeacherId_fkey" FOREIGN KEY ("assistantTeacherId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelSubject" ADD CONSTRAINT "LevelSubject_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelSubject" ADD CONSTRAINT "LevelSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "GradeScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScore" ADD CONSTRAINT "AssessmentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScore" ADD CONSTRAINT "AssessmentScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScore" ADD CONSTRAINT "AssessmentScore_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "GradeScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardLine" ADD CONSTRAINT "ReportCardLine_reportCardId_fkey" FOREIGN KEY ("reportCardId") REFERENCES "ReportCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardLine" ADD CONSTRAINT "ReportCardLine_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptLine" ADD CONSTRAINT "TranscriptLine_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptLine" ADD CONSTRAINT "TranscriptLine_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureItem" ADD CONSTRAINT "FeeStructureItem_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureItem" ADD CONSTRAINT "FeeStructureItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FeeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FeeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminder" ADD CONSTRAINT "FeeReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminder" ADD CONSTRAINT "FeeReminder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAttachment" ADD CONSTRAINT "AnnouncementAttachment_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAttachment" ADD CONSTRAINT "AnnouncementAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoRecipient" ADD CONSTRAINT "MemoRecipient_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoRecipient" ADD CONSTRAINT "MemoRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoAttachment" ADD CONSTRAINT "MemoAttachment_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoAttachment" ADD CONSTRAINT "MemoAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationJob" ADD CONSTRAINT "CommunicationJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationJob" ADD CONSTRAINT "CommunicationJob_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CommunicationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionPosition" ADD CONSTRAINT "ElectionPosition_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ElectionPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterRoll" ADD CONSTRAINT "VoterRoll_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_ballotId_fkey" FOREIGN KEY ("ballotId") REFERENCES "Ballot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ElectionPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuizOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMenu" ADD CONSTRAINT "SiteMenu_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMedia" ADD CONSTRAINT "SiteMedia_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMedia" ADD CONSTRAINT "SiteMedia_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePost" ADD CONSTRAINT "SitePost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteFormSubmission" ADD CONSTRAINT "SiteFormSubmission_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReportDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

