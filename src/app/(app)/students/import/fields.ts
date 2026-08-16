/**
 * The columns the student importer understands.
 *
 * Kept out of `actions.ts` because that file is `"use server"`, and a module
 * marked that way is meant to export server actions — not a table of data that
 * a client component and a command-line script both need to read.
 *
 * Aliases are the whole point of this list. A school's spreadsheet says
 * "Surname", "Parent Name" and "Contact", never "lastName". Every heading added
 * here is one fewer file a registrar has to re-type before an import will run.
 */
export const IMPORT_FIELDS = [
  {
    key: "admissionNo",
    label: "Admission number",
    aliases: ["admissionno", "adm no", "adm", "index", "index number", "student id", "id"],
  },
  {
    key: "firstName",
    label: "First name",
    aliases: ["firstname", "given name", "givenname", "forename", "first"],
  },
  {
    key: "lastName",
    label: "Last name",
    aliases: ["lastname", "surname", "family name", "familyname", "last"],
  },
  {
    key: "otherNames",
    label: "Other names",
    aliases: ["middle name", "middlename", "other name", "middle names"],
  },
  { key: "gender", label: "Gender", aliases: ["sex"] },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    aliases: ["dob", "birth date", "birthdate", "date of birth (dd/mm/yyyy)", "born"],
  },
  {
    key: "className",
    label: "Class",
    aliases: ["class", "form", "grade", "section", "class name", "current class", "stream"],
  },
  { key: "nationality", label: "Nationality", aliases: ["citizenship"] },
  { key: "house", label: "House", aliases: ["house name"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "student phone", "tel"] },
  { key: "email", label: "Email", aliases: ["e-mail", "student email"] },
  {
    key: "residentialAddress",
    label: "Address",
    aliases: ["residential address", "home address", "postal address"],
  },
  {
    key: "guardianName",
    label: "Guardian name",
    aliases: [
      "parent name",
      "guardian",
      "parent",
      "parent/guardian",
      "parent / guardian",
      "father's name",
      "fathers name",
      "mother's name",
      "mothers name",
      "next of kin",
    ],
  },
  {
    key: "guardianPhone",
    label: "Guardian phone",
    aliases: [
      "parent phone",
      "contact",
      "contact number",
      "guardian contact",
      "parent contact",
      "phone number",
      "parent's phone",
      "parents phone",
      "mobile number",
    ],
  },
  {
    key: "guardianEmail",
    label: "Guardian email",
    aliases: ["parent email", "guardian e-mail", "parent e-mail"],
  },
];
