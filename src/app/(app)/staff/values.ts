import type { Staff } from "@prisma/client";

import type { StaffValues } from "./staff-form";

/**
 * A staff row turned into the values the edit form draws.
 *
 * One copy, for the same reason the students module has one: there are two
 * ways into that form now, the page at /staff/[id]/edit and the panel over the
 * list, and a field present in one mapping and missing from the other saves as
 * empty without saying so.
 */

/**
 * Date inputs want yyyy-mm-dd, read in the same timezone the action writes in.
 *
 * This used to be `toISOString().slice(0, 10)`, which reads UTC. Ghana is
 * UTC+0 all year, so it is correct on a machine set to Accra or to UTC and
 * quietly wrong by a day on one set to anywhere west of it — which is the sort
 * of thing that shows up as a date of birth walking backwards on every save,
 * months after somebody moved the deployment.
 */
function dateValue(value: Date | null): string {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function staffFormValues(staff: Staff): StaffValues {
  return {
    id: staff.id,
    title: staff.title ?? "",
    firstName: staff.firstName,
    lastName: staff.lastName,
    otherNames: staff.otherNames ?? "",
    gender: staff.gender,
    dateOfBirth: dateValue(staff.dateOfBirth),
    photoUrl: staff.photoUrl ?? "",
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    altPhone: staff.altPhone ?? "",
    address: staff.address ?? "",
    digitalAddr: staff.digitalAddr ?? "",
    nationality: staff.nationality ?? "Ghanaian",
    nationalId: staff.nationalId ?? "",
    ssnitNumber: staff.ssnitNumber ?? "",
    tin: staff.tin ?? "",
    jobTitle: staff.jobTitle ?? "",
    department: staff.department ?? "",
    employmentType: staff.employmentType,
    hireDate: dateValue(staff.hireDate),
    isTeaching: staff.isTeaching,
    specialisations: staff.specialisations,
    emergencyName: staff.emergencyName ?? "",
    emergencyPhone: staff.emergencyPhone ?? "",
    emergencyRelation: staff.emergencyRelation ?? "",
    notes: staff.notes ?? "",
  };
}
