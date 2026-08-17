import "server-only";

/**
 * One parser for question forms, wherever they are submitted from.
 *
 * The quiz screen and the question bank take identical input — type, prompt,
 * options with a leading asterisk on the correct ones, accepted answers,
 * points — and two copies of this parsing would drift the way two copies
 * always have in this project. The bank and the quiz cannot disagree about
 * what an asterisk means if only one function knows.
 */

export type ParsedQuestion = {
  type: string;
  prompt: string;
  points: number;
  explanation: string | null;
  acceptedAnswers: string[];
  options: Array<{ text: string; isCorrect: boolean }>;
  isChoice: boolean;
};

export function parseQuestionInput(formData: FormData): ParsedQuestion | null {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const prompt = text("prompt");
  if (!prompt) return null;

  const type = text("type") || "MULTIPLE_CHOICE";
  const isChoice = ["MULTIPLE_CHOICE", "MULTIPLE_ANSWER", "TRUE_FALSE"].includes(type);

  // Options arrive as lines of "text" with the correct ones marked by a
  // leading asterisk — far quicker to type than a row of paired inputs, and
  // it survives being pasted from a word processor.
  const options =
    type === "TRUE_FALSE"
      ? [
          { text: "True", isCorrect: text("correctBoolean") === "true" },
          { text: "False", isCorrect: text("correctBoolean") !== "true" },
        ]
      : text("options")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({
            text: line.replace(/^\*\s*/, ""),
            isCorrect: line.startsWith("*"),
          }));

  // A choice question with nothing marked correct can never be answered
  // correctly, and would silently drag every score down.
  if (isChoice && !options.some((option) => option.isCorrect)) return null;

  const points = Number(text("points"));

  return {
    type,
    prompt,
    points: Number.isFinite(points) && points > 0 ? points : 1,
    explanation: text("explanation") || null,
    acceptedAnswers:
      type === "SHORT_ANSWER" || type === "FILL_BLANK"
        ? text("acceptedAnswers")
            .split(/[\n,]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
    options: isChoice ? options : [],
    isChoice,
  };
}
