import "server-only";

import type { PDFFont } from "pdf-lib";

/**
 * Text safety for the standard PDF fonts.
 *
 * pdf-lib's Helvetica throws on the first character outside WinAnsi, and one
 * Kwabɛna in one class is all it takes to fail a whole document. Ghanaian
 * orthography letters are mapped to their closest Latin forms; anything else
 * unencodable is dropped character by character — a missing diacritic beats
 * a missing document. Shared by every renderer that draws names.
 */

const TRANSLITERATE: Record<string, string> = {
  "ɛ": "e", "Ɛ": "E",
  "ɔ": "o", "Ɔ": "O",
  "ŋ": "n", "Ŋ": "N",
  "ƒ": "f", "Ƒ": "F",
  "ʋ": "v", "Ʋ": "V",
  "ɖ": "d", "Ɖ": "D",
};

export function sanitisePdfText(text: string, font: PDFFont): string {
  const mapped = text
    // The cedi sign is not in WinAnsi either, and dropping it silently turned
    // every amount on a payslip into "GH2,800.00". GHS is the ISO code and
    // what a Ghanaian bank statement prints, so it substitutes cleanly.
    .replace(/GH₵s?/g, "GHS ")
    .replace(/₵s?/g, "GHS ")
    .replace(/[ɛƐɔƆŋŊƒƑʋƲɖƉ]/g, (char) => TRANSLITERATE[char]);
  try {
    font.widthOfTextAtSize(mapped, 8);
    return mapped;
  } catch {
    return [...mapped]
      .filter((char) => {
        try {
          font.widthOfTextAtSize(char, 8);
          return true;
        } catch {
          return false;
        }
      })
      .join("");
  }
}
