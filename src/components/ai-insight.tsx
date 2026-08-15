"use client";

import { useTransition } from "react";
import { AlertTriangle, CheckCircle2, Info, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

import { cn, relativeTime } from "@/lib/utils";
import { Badge, Button, EmptyState, type Tone } from "@/components/ui";

export type InsightFinding = {
  label: string;
  detail: string;
  severity: "positive" | "neutral" | "watch" | "concern" | "critical";
  metric: string;
};

export type InsightAction = {
  action: string;
  rationale: string;
  owner: string;
  priority: "low" | "medium" | "high" | "urgent";
};

export type InsightView = {
  title: string;
  narrative: string;
  findings: InsightFinding[];
  actions: InsightAction[];
  createdAt?: Date | string | null;
  model?: string | null;
};

const SEVERITY_TONE: Record<InsightFinding["severity"], Tone> = {
  positive: "success",
  neutral: "neutral",
  watch: "info",
  concern: "warning",
  critical: "danger",
};

const PRIORITY_TONE: Record<InsightAction["priority"], Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

/**
 * Renders an AI-generated insight.
 *
 * Two things are deliberate: the model is always named, and every finding
 * carries the figure it came from — staff should be able to check the model's
 * work, not just trust it.
 */
export function AiInsightCard({
  insight,
  onGenerate,
  enabled = true,
  emptyHint = "Generate an analysis of the current data.",
  className,
}: {
  insight: InsightView | null;
  onGenerate?: () => Promise<void>;
  enabled?: boolean;
  emptyHint?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function generate() {
    if (!onGenerate) return;
    startTransition(async () => {
      await onGenerate();
    });
  }

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {insight?.title ?? "AI insights"}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {insight?.createdAt
                ? `Generated ${relativeTime(insight.createdAt)}${insight.model ? ` · ${insight.model}` : ""}`
                : "Analysis of your school's live data"}
            </p>
          </div>
        </div>

        {onGenerate && enabled ? (
          <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
            {pending ? "Analysing…" : insight ? "Refresh" : "Generate"}
          </Button>
        ) : null}
      </div>

      {!enabled ? (
        <EmptyState
          icon={<Info className="size-5" />}
          title="AI features are switched off"
          description="Add an ANTHROPIC_API_KEY to the environment to enable insights, teaching analytics and drafted report remarks."
        />
      ) : !insight ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No analysis yet"
          description={emptyHint}
          action={
            onGenerate ? (
              <Button size="sm" onClick={generate} disabled={pending}>
                {pending ? "Analysing…" : "Generate insight"}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-5 p-5">
          <div className="space-y-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
            {insight.narrative.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {insight.findings.length ? (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                What the data shows
              </h3>
              <ul className="space-y-2">
                {insight.findings.map((finding, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3"
                  >
                    <SeverityIcon severity={finding.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--text)]">
                          {finding.label}
                        </p>
                        <Badge tone={SEVERITY_TONE[finding.severity]}>
                          {finding.metric}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {finding.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {insight.actions.length ? (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                Recommended actions
              </h3>
              <ol className="space-y-2">
                {insight.actions.map((action, index) => (
                  <li
                    key={index}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-inset)] p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="numeric flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[10px] font-bold text-[var(--primary)]">
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium text-[var(--text)]">
                        {action.action}
                      </p>
                      <Badge tone={PRIORITY_TONE[action.priority]}>
                        {action.priority}
                      </Badge>
                      <Badge tone="neutral">{action.owner}</Badge>
                    </div>
                    <p className="mt-1 pl-7 text-xs text-[var(--text-muted)]">
                      {action.rationale}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <p className="border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-subtle)]">
            AI-generated from your school&apos;s data. Check the figures before acting on
            a recommendation.
          </p>
        </div>
      )}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: InsightFinding["severity"] }) {
  const className = "mt-0.5 size-4 shrink-0";

  switch (severity) {
    case "positive":
      return <CheckCircle2 className={cn(className, "text-[var(--success)]")} />;
    case "critical":
      return <TriangleAlert className={cn(className, "text-[var(--danger)]")} />;
    case "concern":
      return <AlertTriangle className={cn(className, "text-[var(--warning)]")} />;
    case "watch":
      return <Info className={cn(className, "text-[var(--info)]")} />;
    default:
      return <Info className={cn(className, "text-[var(--text-subtle)]")} />;
  }
}
