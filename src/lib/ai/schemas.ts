/**
 * The shape every analytical insight returns.
 *
 * One schema across dashboards, teacher analytics and management briefs means
 * the UI can render any insight with a single component, and a new kind of
 * analysis needs no new interface work.
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
