import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

/**
 * Thin wrapper over the Anthropic SDK.
 *
 * Every AI feature in the system is optional: if no API key is configured the
 * helpers below return `null` rather than throwing, and callers fall back to
 * the plain (non-AI) view. A school with no key still gets a working system.
 */

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!env.ai.enabled) return null;
  cachedClient ??= new Anthropic({ apiKey: env.ai.apiKey });
  return cachedClient;
}

export function isAiEnabled(): boolean {
  return env.ai.enabled;
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

/**
 * Calls Claude and returns a validated object matching `schema`.
 *
 * Uses structured outputs so the response is guaranteed parseable — school
 * staff should never see a half-parsed insight because the model wrapped its
 * JSON in prose.
 */
export async function generateStructured<T>(
  options: AiCallOptions,
): Promise<AiResult<T> | null> {
  const client = getClient();
  if (!client) return null;

  const { system, prompt, schema, maxTokens = 8000, effort = "high" } = options;

  try {
    const response = await client.beta.messages.create({
      model: env.ai.model,
      max_tokens: maxTokens,
      // Adaptive thinking lets the model decide how much reasoning each
      // analysis needs — a single student summary and a whole-school brief
      // are very different problems.
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        format: { type: "json_schema", schema },
      },
      // Safety classifiers can decline a request; falling back keeps the
      // feature working instead of surfacing an error to a head teacher.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      console.warn("[ai] request declined", response.stop_details);
      return null;
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
    );
    if (!textBlock) return null;

    return {
      data: JSON.parse(textBlock.text) as T,
      model: response.model,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    };
  } catch (error) {
    // AI is an enhancement, never a hard dependency: log and degrade.
    console.error("[ai] generation failed", error);
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
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.beta.messages.create({
      model: env.ai.model,
      max_tokens: options.maxTokens ?? 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: options.effort ?? "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
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
    console.error("[ai] text generation failed", error);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Shared schemas
// -----------------------------------------------------------------------------

/**
 * The shape every analytical insight returns. Keeping one schema across
 * dashboards, teacher analytics and management briefs means the UI can render
 * any insight with a single component.
 */
export const INSIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description: "A short, specific headline for this analysis.",
    },
    narrative: {
      type: "string",
      description:
        "2-4 short paragraphs of markdown explaining what the data shows and why it matters.",
    },
    findings: {
      type: "array",
      description: "The concrete observations behind the narrative.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", description: "Short name for the finding." },
          detail: {
            type: "string",
            description: "One or two sentences, citing the specific numbers.",
          },
          severity: {
            type: "string",
            enum: ["positive", "neutral", "watch", "concern", "critical"],
          },
          metric: {
            type: "string",
            description: "The headline figure, e.g. '62% attendance' or '-8.4 marks'.",
          },
        },
        required: ["label", "detail", "severity", "metric"],
      },
    },
    actions: {
      type: "array",
      description: "Recommended next steps, most impactful first.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", description: "What to do, stated imperatively." },
          rationale: { type: "string", description: "Why this will help." },
          owner: {
            type: "string",
            description:
              "Who should act: e.g. 'Form teacher', 'Head of Mathematics', 'Bursar'.",
          },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        },
        required: ["action", "rationale", "owner", "priority"],
      },
    },
  },
  required: ["title", "narrative", "findings", "actions"],
} as const;

export type InsightPayload = {
  title: string;
  narrative: string;
  findings: Array<{
    label: string;
    detail: string;
    severity: "positive" | "neutral" | "watch" | "concern" | "critical";
    metric: string;
  }>;
  actions: Array<{
    action: string;
    rationale: string;
    owner: string;
    priority: "low" | "medium" | "high" | "urgent";
  }>;
};
