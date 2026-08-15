"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import {
  generateAtRiskScan,
  generateFinanceInsight,
  generateManagementBrief,
} from "@/lib/ai/insights";
import { db } from "@/lib/db";

export async function generateManagementBriefAction() {
  const user = await authorize("ai.insight.generate");
  await generateManagementBrief(user.id);
  revalidatePath("/dashboard");
}

export async function generateFinanceInsightAction() {
  const user = await authorize("ai.insight.generate");
  await generateFinanceInsight(user.id);
  revalidatePath("/finance");
}

export async function generateAtRiskScanAction() {
  const user = await authorize("ai.insight.generate");
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  if (!term) return;
  await generateAtRiskScan(term.id, user.id);
  revalidatePath("/analytics");
}
