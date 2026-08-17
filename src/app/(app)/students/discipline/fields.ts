/**
 * The discipline vocabulary, defined once.
 *
 * The form offers these, the action validates against them and the page
 * colour-codes by them. Kept in one file so the three can never drift into
 * the house bug — two parts written at different times that disagree, where
 * neither errors. The seed's values are a subset of these lists.
 */

export const INCIDENT_CATEGORIES = [
  { value: "LATENESS", label: "Lateness" },
  { value: "UNIFORM", label: "Uniform" },
  { value: "TRUANCY", label: "Truancy / absence" },
  { value: "DISRESPECT", label: "Disrespect" },
  { value: "BULLYING", label: "Bullying" },
  { value: "FIGHTING", label: "Fighting" },
  { value: "DAMAGE", label: "Damage to property" },
  { value: "ACADEMIC_DISHONESTY", label: "Academic dishonesty" },
  { value: "PHONE_USE", label: "Phone / device misuse" },
  { value: "OTHER", label: "Other" },
] as const;

export const INCIDENT_SEVERITIES = [
  { value: "MINOR", label: "Minor" },
  { value: "MODERATE", label: "Moderate" },
  { value: "MAJOR", label: "Major" },
  { value: "SEVERE", label: "Severe" },
] as const;

export const INCIDENT_SANCTIONS = [
  { value: "WARNING", label: "Warning" },
  { value: "DETENTION", label: "Detention" },
  { value: "COMMUNITY_SERVICE", label: "Community service" },
  { value: "SUSPENSION", label: "Suspension" },
  { value: "EXPULSION", label: "Expulsion" },
] as const;

export const CATEGORY_VALUES = INCIDENT_CATEGORIES.map((entry) => entry.value);
export const SEVERITY_VALUES = INCIDENT_SEVERITIES.map((entry) => entry.value);
export const SANCTION_VALUES = INCIDENT_SANCTIONS.map((entry) => entry.value);
