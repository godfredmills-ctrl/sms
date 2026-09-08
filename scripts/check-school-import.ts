/**
 * Tests for reading a school out of another system's fee register.
 *
 * Every case below is a real row from the file this was written for, because
 * the failures that matter here are not hypothetical. A misread name is a
 * child a teacher cannot find; a misread amount is a bill a parent disputes;
 * a misread class is a register with the wrong children on it.
 *
 * The one that would do real damage is the zero. The register writes N/A for a
 * balance of nothing and 0.00 for a fee nobody has set yet. Read the same way,
 * 249 children get a bill for nothing and the school finds out at the end of
 * term that it never charged four of its classes.
 */

import {
  LEVELS,
  isPseudoClass,
  levelFor,
  looksLikeATermFee,
  modalFee,
  parseMoney,
  resolveSession,
  splitName,
  studentKey,
  suspectOrder,
  tidyName,
  titleCase,
  type SourceRow,
} from "../src/lib/school-import";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else failures.push(`${name}\n      expected ${b}\n      actual   ${a}`);
}

function ok(name: string, condition: boolean) {
  check(name, condition, true);
}

// -----------------------------------------------------------------------------
// Money
// -----------------------------------------------------------------------------

check("a plain fee", parseMoney("GHC 1150.00"), 115_000);
check("a thousands separator", parseMoney("GHC 1,100"), 110_000);
check("pesewas survive", parseMoney("GHC 595.36"), 59_536);
check("no currency prefix", parseMoney("1050"), 105_000);
check("GHS spelling", parseMoney("GHS 1,050.00"), 105_000);

check("N/A is not a number", parseMoney("N/A"), null);
check("an empty cell is not a number", parseMoney(""), null);
check("and neither is nothing at all", parseMoney(null), null);
check(
  "but a real zero IS zero, and must not become null",
  parseMoney("GHC 0.00"),
  0,
);
ok(
  "which is the whole distinction: N/A and 0.00 differ",
  parseMoney("N/A") !== parseMoney("GHC 0.00"),
);

// -----------------------------------------------------------------------------
// Names
// -----------------------------------------------------------------------------

check("the double spaces in the export close up", tidyName("Adubea  Joy"), "Adubea Joy");
check("shouting is calmed", titleCase("FAVOUR  ATINKAWAN"), "Favour Atinkawan");
check(
  "a name already cased is left alone",
  titleCase("Adu-Ameyaw Jepson Ohene"),
  "Adu-Ameyaw Jepson Ohene",
);
check(
  "hyphens capitalise on both sides",
  titleCase("SETH ASUMADU JESSY SALIFU-N-YEBOAH"),
  "Seth Asumadu Jessy Salifu-N-Yeboah",
);
check("a trailing initial keeps its stop", tidyName("Adjocatcher Addie Jewela O."), "Adjocatcher Addie Jewela O.");

check("surname, given, the rest", splitName("Abdulai Mufti Nasara"), {
  lastName: "Abdulai",
  firstName: "Mufti",
  otherNames: "Nasara",
});
check("two names only", splitName("Adubea  Joy"), {
  lastName: "Adubea",
  firstName: "Joy",
  otherNames: null,
});
check("five names", splitName("Anthony Foanor Cherish Amanuah"), {
  lastName: "Anthony",
  firstName: "Foanor",
  otherNames: "Cherish Amanuah",
});
check("a shouted name is split AND calmed", splitName("ANTWI PHYLIX AMEA"), {
  lastName: "Antwi",
  firstName: "Phylix",
  otherNames: "Amea",
});
ok(
  "a single token never leaves firstName empty, which the schema forbids",
  splitName("Zulka").firstName.length > 0,
);

// Both of these are in the register. Left alone they produce a child whose
// first name is a hyphen, which is what a class list would then print.
check("a stray separator is not a first name", splitName("ABDUL - FAILA ABUBARKAR"), {
  lastName: "Abdul",
  firstName: "Faila",
  otherNames: "Abubarkar",
});
check("nor is it here", splitName("Tipa - Ya Hidaya Abdulai"), {
  lastName: "Tipa",
  firstName: "Ya",
  otherNames: "Hidaya Abdulai",
});
check("but an initial IS a name, and is kept", splitName("ABDUL B. BIMUNKA SHAKUUR"), {
  lastName: "Abdul",
  firstName: "B.",
  otherNames: "Bimunka Shakuur",
});
check("and so is this one", splitName("Gyedom A. Kyekemeh Foriwaa").firstName, "A.");

check(
  "the same child written two ways is one key",
  studentKey("ANTWI  PHYLIX AMEA") === studentKey("Antwi Phylix Amea"),
  true,
);
check(
  "punctuation does not split a family",
  studentKey("Adu-Ameyaw Jepson"),
  "ADU AMEYAW JEPSON",
);

ok("a given name in the surname slot is flagged", suspectOrder("FAVOUR  ATINKAWAN"));
ok("and another", suspectOrder("AXEL ADDAI BOAFO"));
ok("and a third", suspectOrder("Eleanor Benewaa Saah"));
ok("a surname-first name is not flagged", !suspectOrder("Abdulai Mufti Nasara"));
ok("nor this one", !suspectOrder("Yennupaak Issahaku Shamsia"));

// -----------------------------------------------------------------------------
// Classes
// -----------------------------------------------------------------------------

check("the ladder has fourteen rungs", LEVELS.length, 14);
ok(
  "and its sequence is 1..14 with no gaps, which promotion depends on",
  LEVELS.every((level, index) => level.sequence === index + 1),
);
ok(
  "and every code is unique",
  new Set(LEVELS.map((l) => l.code)).size === LEVELS.length,
);
ok("there is deliberately no JHS 3", !LEVELS.some((l) => l.code === "JHS3"));

check("a class maps to its level", levelFor("BASIC 3")?.code, "BASIC3");
check("creche too", levelFor("CRECHE 1")?.code, "CRECHE1");
check("and JHS", levelFor("JHS 2")?.code, "JHS2");
check("spacing does not matter", levelFor("  KG   2 ")?.code, "KG2");

check("a leaver has no class", levelFor("Changed school"), null);
check("nor has the unplaced one", levelFor("All Classes"), null);
ok("and both are named as such", isPseudoClass("Changed school") && isPseudoClass("All Classes"));
ok("a real class is not", !isPseudoClass("BASIC 3"));
check("an unknown class is not invented", levelFor("SHS 1"), null);

// -----------------------------------------------------------------------------
// Resolving a session
// -----------------------------------------------------------------------------

const row = (name: string, cls: string): SourceRow => ({
  session: "2026/2027",
  term: "First Term",
  cls,
  name,
  requiredMinor: null,
  paidMinor: null,
});

const plain = resolveSession([row("Abdulai Mufti Nasara", "CRECHE 2")]);
check("one row, one child", plain.length, 1);
check("placed in their class", plain[0].levelCode, "CRECHE2");
ok("and not marked as gone", !plain[0].hasLeft);

// The seventeen. This is the case the whole function exists for.
const both = resolveSession([
  row("ABASS KUNDIMA NUSWAIRA", "BASIC 4"),
  row("ABASS KUNDIMA NUSWAIRA", "Changed school"),
]);
check("a child in a class AND in Changed school is one child", both.length, 1);
ok("who has left", both[0].hasLeft);
check("and is enrolled nowhere", both[0].levelCode, null);
check("but their last class is remembered", both[0].lastLevelCode, "BASIC4");

check(
  "the order of the two rows does not change the answer",
  resolveSession([
    row("ABASS KUNDIMA NUSWAIRA", "Changed school"),
    row("ABASS KUNDIMA NUSWAIRA", "BASIC 4"),
  ])[0].levelCode,
  null,
);
check(
  "and the last class is still found when the leaver row comes first",
  resolveSession([
    row("ABASS KUNDIMA NUSWAIRA", "Changed school"),
    row("ABASS KUNDIMA NUSWAIRA", "BASIC 4"),
  ])[0].lastLevelCode,
  "BASIC4",
);

const twice = resolveSession([
  row("ZAKIYA AHMED ABDULAI", "NURSERY 2"),
  row("ZAKIYA AHMED ABDULAI", "NURSERY 2"),
]);
check("the same row twice is still one child", twice.length, 1);
check("in their class", twice[0].levelCode, "NURSERY2");

const unplaced = resolveSession([row("Nova Anyane Oye", "All Classes")]);
check("the unplaced child is kept", unplaced.length, 1);
check("with no class", unplaced[0].levelCode, null);
ok("but is NOT recorded as having left, because they have not", !unplaced[0].hasLeft);

check(
  "a shouted duplicate of a cased name is still one child",
  resolveSession([row("Antwi Phylix Amea", "BASIC 3"), row("ANTWI  PHYLIX AMEA", "BASIC 3")]).length,
  1,
);

// -----------------------------------------------------------------------------
// The rate a level charges
// -----------------------------------------------------------------------------

// Creche 2 last term: 1100 x47, 550 x9, 775 x3.
check(
  "the standard rate wins over the discounts",
  modalFee([110_000, 110_000, 110_000, 55_000, 55_000, 77_500]),
  110_000,
);
check(
  "an outlier does not move it, the way a mean would",
  modalFee([105_000, 105_000, 105_000, 233_200]),
  105_000,
);
check("zeros are not a rate", modalFee([0, 0, 0]), null);
check("nor are nulls", modalFee([null, null]), null);
check("a level with nothing set has no rate", modalFee([]), null);
check(
  "zeros are ignored, not counted, when a real rate is present",
  modalFee([0, 0, 0, 105_000, 105_000]),
  105_000,
);
check(
  "a tie goes to the larger amount, so the school never under-charges",
  modalFee([105_000, 110_000]),
  110_000,
);

ok("a term fee looks like one", looksLikeATermFee(105_000));
ok("and the half rate still does", looksLikeATermFee(55_000));
ok("Basic 2 at 210 does not", !looksLikeATermFee(21_000));
ok("nor does nothing at all", !looksLikeATermFee(null));
ok("nor does zero", !looksLikeATermFee(0));

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} school import checks passed.`);
