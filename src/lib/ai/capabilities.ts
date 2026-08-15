/**
 * What the configured Claude model actually supports.
 *
 * Several request features are only available on newer models, and sending
 * them to an older one is a hard 400 rather than a graceful downgrade:
 *
 *   "adaptive thinking is not supported on this model"
 *
 * Rather than pin the whole system to one model id, requests are assembled
 * from these capabilities. A school that switches ANTHROPIC_MODEL to
 * something cheaper gets a working request, not a stack trace.
 */

export type ModelCapabilities = {
  /** `thinking: { type: "adaptive" }` — 4.6 and newer. */
  adaptiveThinking: boolean;
  /** `output_config.effort` — same generation as adaptive thinking. */
  effort: boolean;
  /** Server-side refusal fallbacks. */
  fallbacks: boolean;
  /** `output_config.format` with a JSON schema. */
  structuredOutputs: boolean;
};

/** Models with the current request surface. */
const CURRENT_GENERATION =
  /^claude-(opus-5|opus-4-8|opus-4-7|opus-4-6|sonnet-5|sonnet-4-6|fable-5|mythos-5)\b/;

/** Older models that still constrain output to a schema. */
const STRUCTURED_ONLY = /^claude-(haiku-4-5|opus-4-5|opus-4-1)\b/;

export function capabilitiesFor(model: string): ModelCapabilities {
  const current = CURRENT_GENERATION.test(model);

  return {
    adaptiveThinking: current,
    effort: current,
    fallbacks: current,
    structuredOutputs: current || STRUCTURED_ONLY.test(model),
  };
}

/**
 * Extracts a JSON object from a model that had to be asked in prose rather
 * than constrained by a schema. Tolerates code fences and surrounding text,
 * which is exactly what an unconstrained model tends to add.
 */
export function parseLooseJson<T>(text: string): T | null {
  const withoutFences = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const candidates = [withoutFences];

  // Fall back to the outermost braces if there is commentary around the object.
  const first = withoutFences.indexOf("{");
  const last = withoutFences.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(withoutFences.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
