import type { Student } from "@prisma/client";

import type { StudentFormValues } from "./student-form";

/**
 * A student row turned into the values the edit form draws.
 *
 * Written once because there are two ways into that form now: the page at
 * /students/[id]/edit, and the panel that opens over the list. Two copies of a
 * forty-field mapping is the shape this codebase keeps having to fix — the two
 * drift, and the drift is silent, because a missing field just renders as an
 * empty box and saves as empty. A registrar corrects a phone number in the
 * panel and clears the child's hometown without being told.
 */

/**
 * Date inputs want yyyy-mm-dd and nothing else, read back in the same timezone
 * the action writes in. toISOString() would read UTC against a value stored at
 * local midnight, and a date of birth would walk one day backwards on every
 * save.
 */
function dateValue(value: Date | null): string {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function studentFormValues(student: Student): StudentFormValues {
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    indexNumber: student.indexNumber ?? "",
    firstName: student.firstName,
    lastName: student.lastName,
    otherNames: student.otherNames ?? "",
    preferredName: student.preferredName ?? "",
    gender: student.gender,
    dateOfBirth: dateValue(student.dateOfBirth),
    placeOfBirth: student.placeOfBirth ?? "",
    photoUrl: student.photoUrl ?? "",
    nationality: student.nationality ?? "Ghanaian",
    nationalId: student.nationalId ?? "",
    birthCertNo: student.birthCertNo ?? "",
    nhisNumber: student.nhisNumber ?? "",
    religion: student.religion ?? "",
    hometown: student.hometown ?? "",
    homeRegion: student.homeRegion ?? "",
    firstLanguage: student.firstLanguage ?? "English",
    email: student.email ?? "",
    phone: student.phone ?? "",
    residentialAddress: student.residentialAddress ?? "",
    digitalAddr: student.digitalAddr ?? "",
    city: student.city ?? "",
    region: student.region ?? "",
    livingWith: student.livingWith ?? "",
    transportMode: student.transportMode ?? "",
    busRoute: student.busRoute ?? "",
    isBoarder: student.isBoarder,
    house: student.house ?? "",
    dormitory: student.dormitory ?? "",
    roomNumber: student.roomNumber ?? "",
    hasSpecialNeeds: student.hasSpecialNeeds,
    specialNeedsNotes: student.specialNeedsNotes ?? "",
    learningSupport: student.learningSupport,
    onScholarship: student.onScholarship,
    scholarshipDetails: student.scholarshipDetails ?? "",
    notes: student.notes ?? "",
  };
}
