import Anthropic from "@anthropic-ai/sdk";

import { integrationConfig } from "@/lib/integrations/config";

import { capabilitiesFor, parseLooseJson } from "./capabilities";

// Re-exported so callers have a single import for the AI surface.
export { INSIGHT_SCHEMA, type InsightPayload } from "./schemas";

/**
 * Thin wrapper over the Anthropic SDK.
 *
 * Every AI feature in the system is optional: if no API key is configured the
 * helpers below return `null` rather than throwing, and callers fall back to
 * the plain (non-AI) view. A school with no key still gets a working system.
 *
 * Requests are assembled from the configured model's capabilities rather than
 * assuming the newest surface, so pointing ANTHROPIC_MODEL at an older model
 * degrades the request instead of failing it.
 */

/** Cached against the key it was built from — see the note on the mail transport. */
let cachedClient: { apiKey: string; client: Anthropic } | null = null;

async function getClient(): Promise<Anthropic | null> {
  const { ai } = await integrationConfig();
  if (!ai.enabled) return null;
  if (cachedClient?.apiKey !== ai.apiKey) {
    cachedClient = { apiKey: ai.apiKey, client: new Anthropic({ apiKey: ai.apiKey }) };
  }
  return cachedClient.client;
}

export async function isAiEnabled(): Promise<boolean> {
  return (await integrationConfig()).ai.enabled;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiResult<T> = {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type AiCallOptions = {
  system: string;
  prompt: string;
  /** JSON Schema the response must conform to. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
};

/** Builds the parts of a request that depend on what the model supports. */
function requestShape(model: string, effort: Effort) {
  const supports = capabilitiesFor(model);

  return {
    model,
    supports,
    // Adaptive thinking lets the model decide how much reasoning each analysis
    // needs — a single student summary and a whole-school brief are very
    // different problems. Older models reject the parameter outright.
    ...(supports.adaptiveThinking
      ? { thinking: { type: "adaptive" as const } }
      : {}),
    // Safety classifiers can decline a request; falling back keeps the feature
    // working instead of surfacing an error to a head teacher.
    ...(supports.fallbacks
      ? {
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }
      : {}),
    effortConfig: supports.effort ? { effort } : {},
  };
}

/** Instruction used when the model cannot be constrained by a schema. */
function jsonInstruction(schema: Record<string, unknown>): string {
  return `\n\nRespond with a single JSON object that conforms to this JSON Schema. Output only the JSON — no explanation, no markdown, no code fences.\n\n${JSON.stringify(
    schema,
  )}`;
}

/**
 * Calls Claude and returns a validated object matching `schema`.
 *
 * Uses structured outputs where available so the response is guaranteed
 * parseable — school staff should never see a half-parsed insight because the
 * model wrapped its JSON in prose. On models without that feature the schema
 * is asked for in the prompt and the reply is parsed tolerantly.
 */
export async function generateStructured<T>(
  options: AiCallOptions,
): Promise<AiResult<T> | null> {
  const client = await getClient();
  if (!client) return null;

  const { system, prompt, schema, maxTokens = 8000, effort = "high" } = options;
  const { ai } = await integrationConfig();
  const shape = requestShape(ai.model, effort);

  try {
    const response = await client.beta.messages.create({
      model: shape.model,
      max_tokens: maxTokens,
      ...(shape.thinking ? { thinking: shape.thinking } : {}),
      ...(shape.betas ? { betas: shape.betas, fallbacks: shape.fallbacks } : {}),
      output_config: {
        ...shape.effortConfig,
        ...(shape.supports.structuredOutputs
          ? { format: { type: "json_schema" as const, schema } }
          : {}),
      },
      system: shape.supports.structuredOutputs
        ? system
        : system + jsonInstruction(schema),
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      console.warn("[ai] request declined", response.stop_details);
      return null;
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!text) return null;

    const data = shape.supports.structuredOutputs
      ? (JSON.parse(text) as T)
      : parseLooseJson<T>(text);

    if (!data) {
      console.warn("[ai] could not parse a JSON object from the response");
      return null;
    }

    return {
      data,
      model: response.model,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    };
  } catch (error) {
    // AI is an enhancement, never a hard dependency: log and degrade.
    logAiFailure(error, ai.model);
    return null;
  }
}

/** Free-text generation for short outputs such as report-card remarks. */
export async function generateText(options: {
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: Effort;
}): Promise<AiResult<string> | null> {
  const client = await getClient();
  if (!client) return null;

  const { ai } = await integrationConfig();
  const shape = requestShape(ai.model, options.effort ?? "medium");

  try {
    const response = await client.beta.messages.create({
      model: shape.model,
      max_tokens: options.maxTokens ?? 2000,
      ...(shape.thinking ? { thinking: shape.thinking } : {}),
      ...(shape.betas ? { betas: shape.betas, fallbacks: shape.fallbacks } : {}),
      ...(Object.keys(shape.effortConfig).length
        ? { output_config: shape.effortConfig }
        : {}),
      system: options.system,
      messages: [{ role: "user", content: options.prompt }],
    });

    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return null;

    return {
      data: text,
      model: response.model,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    };
  } catch (error) {
    logAiFailure(error, ai.model);
    return null;
  }
}

/**
 * A 400 from the API is nearly always a configuration problem, and the raw
 * SDK error buries the message under several hundred lines of headers. Pull
 * out the part that says what to change.
 */
function logAiFailure(error: unknown, model: string) {
  const candidate = error as {
    status?: number;
    error?: { error?: { message?: string } };
    message?: string;
  };

  const detail =
    candidate?.error?.error?.message ?? candidate?.message ?? String(error);

  if (candidate?.status === 400) {
    console.error(
      `[ai] request rejected for model "${model}": ${detail}\n` +
        `[ai] If this names an unsupported parameter, clear the model setting to use the default.`,
    );
    return;
  }

  console.error(`[ai] generation failed (${candidate?.status ?? "no status"}): ${detail}`);
}
