import { prisma } from "@tidysync/database";
import {
  parseAgentIntent,
  buildSeoImprovementPlan,
  buildDescriptionRewritePlanForProductIds,
  parseNlBulkEditWithAi,
  humanizeScanSummary,
} from "@tidysync/ai";
import { buildDiffFromMutationPlan } from "../shopify-products";
import { scanStoreInWorker } from "./agent-scan";

type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

interface AgentPlan {
  steps: AgentStep[];
  phase: string;
  intent?: string;
  previewJobId?: string;
  suggestedActions?: string[];
}

async function persistSteps(jobId: string, steps: AgentStep[], phase: string, extra?: Record<string, unknown>) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const plan = (job?.mutationPlan as AgentPlan | null) ?? { steps: [], phase: "starting" };
  await prisma.job.update({
    where: { id: jobId },
    data: { mutationPlan: { ...plan, steps, phase, ...extra } as object },
  });
}

async function bumpStep(
  jobId: string,
  stepId: string,
  status: StepStatus,
  detail: string | undefined,
  steps: AgentStep[],
) {
  const updated = steps.map((s) => (s.id === stepId ? { ...s, status, detail: detail ?? s.detail } : s));
  await persistSteps(jobId, updated, stepId);
  return updated;
}

async function consumeAiCreditWorker(tenantId: string, credits = 1) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
  if (!tenant?.plan) throw new Error("Plan not found");
  const limit = tenant.plan.aiCreditsPerMonth + tenant.extraAiCredits;
  if (tenant.aiCreditsUsed + credits > limit) {
    throw new Error("AI credit limit reached for this month.");
  }
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { aiCreditsUsed: tenant.aiCreditsUsed + credits },
  });
}

export async function processAgentRun(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, tenantId } });
  if (!job?.nlPrompt) throw new Error("Agent job not found");

  let steps: AgentStep[] = [
    { id: "understand", label: "Understanding your mission", status: "pending" },
    { id: "plan", label: "Building execution plan", status: "pending" },
    { id: "execute", label: "Running catalog operations", status: "pending" },
    { id: "finalize", label: "Preparing results for review", status: "pending" },
  ];

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      mutationPlan: { steps, phase: "understand" } as object,
    },
  });

  try {
    steps = await bumpStep(jobId, "understand", "running", "Parsing intent with mission planner…", steps);
    const intentResult = await parseAgentIntent(job.nlPrompt);
    steps = await bumpStep(
      jobId,
      "understand",
      "done",
      `Mission: ${intentResult.intent.replace(/_/g, " ")}`,
      steps,
    );

    steps = await bumpStep(jobId, "plan", "running", "Selecting tools and safety checks…", steps);
    steps = await bumpStep(jobId, "plan", "done", "Execution plan ready", steps);

    steps = await bumpStep(jobId, "execute", "running", "Working in the background…", steps);

    let message = "";
    let previewJobId: string | undefined;
    let scanResult: Awaited<ReturnType<typeof scanStoreInWorker>> | null = null;

    if (intentResult.intent === "FIX_STORE") {
      scanResult = await scanStoreInWorker(shop, 150);
      message = humanizeScanSummary(scanResult);
      steps = await bumpStep(
        jobId,
        "execute",
        "done",
        `Scanned ${scanResult.productCount} products · ${scanResult.issues.length} issues`,
        steps,
      );
    } else if (intentResult.intent === "CREATE_BACKUP") {
      message =
        "Catalog snapshots live in the Backups tab — open Backups from the sidebar anytime. No backup was started from this mission.";
      steps = await bumpStep(jobId, "execute", "skipped", "Use Backups tab instead", steps);
    } else if (intentResult.intent === "IMPORT_WITH_RULES") {
      message = "For conditional imports, the Import tab is the right place — upload your file and add rules there.";
      steps = await bumpStep(jobId, "execute", "skipped", "Open Import tab", steps);
    } else if (intentResult.intent === "IMPROVE_DESCRIPTION") {
      scanResult = await scanStoreInWorker(shop, 150);
      const thinIds = scanResult.issues
        .filter((i) => i.title === "Thin description" && i.productId)
        .map((i) => i.productId!)
        .slice(0, 50);
      if (thinIds.length === 0) {
        message =
          "I looked for thin descriptions but your products already have solid copy — nice work!";
        steps = await bumpStep(jobId, "execute", "done", "No thin descriptions found", steps);
      } else {
        const plan = buildDescriptionRewritePlanForProductIds(thinIds);
        const previewJob = await prisma.job.create({
          data: {
            tenantId,
            type: "BULK_EDIT",
            status: "PREVIEW",
            nlPrompt: job.nlPrompt,
            isAiGenerated: true,
            mutationPlan: { ...plan, parentAgentJobId: jobId } as object,
          },
        });
        const diff = await buildDiffFromMutationPlan(shop, plan);
        await prisma.job.update({
          where: { id: previewJob.id },
          data: {
            diffPreview: diff as object,
            impactSummary: `Richer descriptions drafted for ${diff.totalChanges} product(s).`,
            rowCount: diff.totalChanges,
          },
        });
        previewJobId = previewJob.id;
        message = `I found ${thinIds.length} products with short descriptions and drafted richer copy — review before anything goes live.`;
        steps = await bumpStep(jobId, "execute", "done", `${diff.totalChanges} descriptions drafted`, steps);
      }
    } else if (intentResult.intent === "IMPROVE_SEO") {
      const plan = buildSeoImprovementPlan(intentResult.productFilter);
      const previewJob = await prisma.job.create({
        data: {
          tenantId,
          type: "BULK_EDIT",
          status: "PREVIEW",
          nlPrompt: job.nlPrompt,
          isAiGenerated: true,
          mutationPlan: { ...plan, parentAgentJobId: jobId } as object,
        },
      });
      const diff = await buildDiffFromMutationPlan(shop, plan);
      await prisma.job.update({
        where: { id: previewJob.id },
        data: {
          diffPreview: diff as object,
          impactSummary: `SEO improvements for ${diff.totalChanges} product(s).`,
          rowCount: diff.totalChanges,
        },
      });
      previewJobId = previewJob.id;
      message = "Your SEO improvements are ready — take a look at the proposed changes and approve when you're happy.";
      steps = await bumpStep(jobId, "execute", "done", `${diff.totalChanges} products in plan`, steps);
    } else {
      const parsed = await parseNlBulkEditWithAi(job.nlPrompt);
      if (parsed.modelUsed && parsed.modelUsed !== "rule-based") {
        await consumeAiCreditWorker(tenantId, 1);
      }
      const previewJob = await prisma.job.create({
        data: {
          tenantId,
          type: "BULK_EDIT",
          status: "PREVIEW",
          nlPrompt: job.nlPrompt,
          isAiGenerated: true,
          mutationPlan: { ...parsed.plan, parentAgentJobId: jobId } as object,
        },
      });
      const diff = await buildDiffFromMutationPlan(shop, parsed.plan);
      await prisma.job.update({
        where: { id: previewJob.id },
        data: {
          diffPreview: diff as object,
          impactSummary: `Bulk edit affects ${diff.totalChanges} row(s).`,
          rowCount: diff.totalChanges,
        },
      });
      previewJobId = previewJob.id;
      message = "Here's your bulk edit plan — nothing changes in Shopify until you approve.";
      steps = await bumpStep(jobId, "execute", "done", `${diff.totalChanges} proposed changes`, steps);
    }

    steps = await bumpStep(jobId, "finalize", "running", "Packaging briefing…", steps);
    steps = await bumpStep(jobId, "finalize", "done", "Complete", steps);

    const finalPlan: AgentPlan = {
      steps,
      phase: "complete",
      intent: intentResult.intent,
      previewJobId,
      suggestedActions: intentResult.suggestedActions,
    };

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        impactSummary: message,
        diffPreview: scanResult ? (scanResult as object) : undefined,
        mutationPlan: finalPlan as object,
        rowCount: scanResult?.productCount ?? 0,
        successCount: scanResult?.overallHealthScore ?? 0,
      },
    });

    await prisma.aiOperation.create({
      data: {
        tenantId,
        jobId,
        operationType: "AGENT_RUN",
        prompt: job.nlPrompt,
        generatedPlan: finalPlan as object,
        creditsConsumed: 0,
        modelUsed: intentResult.modelUsed,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Agent mission failed";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: msg,
        mutationPlan: { steps, phase: "failed" } as object,
      },
    });
    throw err;
  }
}
