import { Resend } from "resend";
import { prisma } from "@tidysync/database";

let resendClient: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function resendFromAddress() {
  const email = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const name = process.env.RESEND_FROM_NAME ?? "TidySync";
  return `${name} <${email}>`;
}

function dashboardUrl(shopDomain: string): string {
  const base = process.env.EMBEDDED_APP_URL ?? process.env.PUBLIC_APP_URL ?? "https://app.tidysync.com";
  return `${base.replace(/\/$/, "")}?shop=${encodeURIComponent(shopDomain)}`;
}

interface JobNotificationContext {
  type: string;
  status: string;
  fileName?: string | null;
  nlPrompt?: string | null;
  impactSummary?: string | null;
  errorSummary?: string | null;
  rowCount: number;
  successCount: number;
  failedCount: number;
  mutationPlan?: { action?: string; label?: string } | null;
}

function taskLabel(job: JobNotificationContext): string {
  if (job.type === "BULK_EDIT" && job.mutationPlan?.action === "restore_backup") {
    return "Catalog restore";
  }
  switch (job.type) {
    case "IMPORT":
      return "Catalog import";
    case "EXPORT":
      return "Data export";
    case "BULK_EDIT":
      return "Bulk edit";
    case "BACKUP":
      return "Catalog backup";
    case "AGENT_RUN":
      return "Agent mission";
    case "CATALOG_HEALTH_SCAN":
      return "Catalog health scan";
    case "CONTENT_REWRITE":
      return "AI content update";
    case "SUPPLIER_FEED_SYNC":
      return "Supplier feed sync";
    case "UNDO":
      return "Undo changes";
    default:
      return "Store task";
  }
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function formatCountLine(job: JobNotificationContext): string | null {
  const { rowCount, successCount, failedCount, type } = job;

  if (type === "BACKUP") {
    const n = successCount || rowCount;
    if (n <= 0) return "Your catalog snapshot was saved.";
    return `${n.toLocaleString()} ${pluralize(n, "product", "products")} saved to your vault`;
  }

  if (type === "AGENT_RUN") {
    if (job.impactSummary) return job.impactSummary;
    return "Your agent finished planning and any follow-up steps are ready to review.";
  }

  if (type === "CATALOG_HEALTH_SCAN") {
    if (rowCount > 0) {
      return `We reviewed ${rowCount.toLocaleString()} ${pluralize(rowCount, "product", "products")} in your catalog`;
    }
    return "Your catalog health report is ready";
  }

  if (rowCount > 0) {
    const lines: string[] = [];
    if (successCount > 0) {
      const noun =
        type === "IMPORT"
          ? pluralize(successCount, "product added to Shopify", "products added to Shopify")
          : type === "EXPORT"
            ? pluralize(successCount, "row exported", "rows exported")
            : pluralize(successCount, "change applied", "changes applied");
      lines.push(`${successCount.toLocaleString()} ${noun}`);
    }
    if (failedCount > 0) {
      lines.push(
        `${failedCount.toLocaleString()} ${pluralize(failedCount, "item needs your review", "items need your review")}`,
      );
    }
    if (lines.length > 0) return lines.join("\n");
  }

  if (job.impactSummary) return job.impactSummary;

  return null;
}

function buildJobNotification(
  job: JobNotificationContext,
  shopLabel: string,
  shopDomain: string,
  status: string,
): { subject: string; text: string; html: string; slackText: string } {
  const task = taskLabel(job);
  const appUrl = dashboardUrl(shopDomain);
  const isSuccess = status === "COMPLETED";
  const isFailed = status === "FAILED";

  const detail = formatCountLine(job);
  const contextLine =
    job.fileName
      ? `File: ${job.fileName}`
      : job.nlPrompt
        ? `Request: ${job.nlPrompt.length > 120 ? `${job.nlPrompt.slice(0, 117)}…` : job.nlPrompt}`
        : job.mutationPlan?.label
          ? job.mutationPlan.label
          : null;

  let subject: string;
  if (isSuccess) {
    if (job.failedCount > 0 && job.successCount > 0) {
      subject = `${task} finished — a few items need review`;
    } else if (job.type === "IMPORT") {
      subject = "Your import finished — products are live in Shopify";
    } else if (job.type === "BACKUP") {
      subject = "Your catalog backup is ready";
    } else if (job.type === "BULK_EDIT" && job.mutationPlan?.action === "restore_backup") {
      subject = "Your catalog restore finished";
    } else if (job.type === "AGENT_RUN") {
      subject = "Your agent mission finished";
    } else if (job.type === "CATALOG_HEALTH_SCAN") {
      subject = "Your catalog health scan is complete";
    } else if (job.type === "CONTENT_REWRITE") {
      subject = "Your AI content update is complete";
    } else if (job.type === "EXPORT") {
      subject = "Your export is ready";
    } else {
      subject = `${task} finished successfully`;
    }
  } else if (isFailed) {
    subject = `${task} could not finish — action may be needed`;
  } else {
    subject = `Update from TidySync: ${task}`;
  }

  const greeting = "Hi there,";
  const intro = isSuccess
    ? `Good news — your **${task.toLowerCase()}** for **${shopLabel}** finished successfully.`
    : isFailed
      ? `We ran into a problem while running your **${task.toLowerCase()}** for **${shopLabel}**.`
      : `Here's an update on your **${task.toLowerCase()}** for **${shopLabel}**.`;

  const textLines = [
    greeting,
    "",
    intro.replace(/\*\*/g, ""),
    "",
  ];

  if (detail) {
    for (const line of detail.split("\n")) {
      textLines.push(`• ${line}`);
    }
    textLines.push("");
  }

  if (contextLine) {
    textLines.push(contextLine);
    textLines.push("");
  }

  if (isFailed && job.errorSummary) {
    textLines.push(`What went wrong: ${job.errorSummary}`);
    textLines.push("");
    textLines.push("Open TidySync to see details and try again, or contact support if this keeps happening.");
  } else if (isSuccess && job.failedCount > 0) {
    textLines.push("Some rows did not complete — open TidySync to review and fix them.");
  } else if (isSuccess) {
    textLines.push("Open TidySync in your Shopify admin to review the results.");
  }

  textLines.push("");
  textLines.push(`Open TidySync: ${appUrl}`);
  textLines.push("");
  textLines.push("— The TidySync team");

  const text = textLines.join("\n");

  const htmlDetail = detail
    ? detail
        .split("\n")
        .map((line) => `<li>${line}</li>`)
        .join("")
    : "";

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #202223; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p style="margin: 0 0 16px;">${greeting}</p>
  <p style="margin: 0 0 16px;">${intro.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>
  ${htmlDetail ? `<ul style="margin: 0 0 16px; padding-left: 20px;">${htmlDetail}</ul>` : ""}
  ${contextLine ? `<p style="margin: 0 0 16px; color: #6d7175; font-size: 14px;">${contextLine}</p>` : ""}
  ${isFailed && job.errorSummary ? `<p style="margin: 0 0 16px; padding: 12px; background: #fff4f4; border-radius: 8px; border: 1px solid #fcd9d9;"><strong>What went wrong:</strong> ${job.errorSummary}</p>` : ""}
  <p style="margin: 24px 0;">
    <a href="${appUrl}" style="display: inline-block; background: #008060; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Open TidySync</a>
  </p>
  <p style="margin: 24px 0 0; font-size: 13px; color: #6d7175;">— The TidySync team</p>
</body>
</html>`.trim();

  const slackText = [
    isSuccess ? `✅ ${task} finished for ${shopLabel}` : `⚠️ ${task} failed for ${shopLabel}`,
    detail ?? "",
    contextLine ?? "",
    isFailed && job.errorSummary ? `Error: ${job.errorSummary}` : "",
    appUrl,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, text, html, slackText };
}

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const client = getResendClient();
  if (!client) return false;

  try {
    const { error } = await client.emails.send({
      from: resendFromAddress(),
      to,
      subject,
      text,
      html: html ?? undefined,
    });
    if (error) {
      console.error("[tidysync] Resend error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[tidysync] Resend send failed:", err);
    return false;
  }
}

export async function notifyJobComplete(tenantId: string, jobId: string, status: string) {
  const settings = await prisma.notificationSetting.findUnique({ where: { tenantId } });
  if (!settings) return;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const shopLabel = tenant?.shopName ?? tenant?.shopDomain ?? "your store";
  const shopDomain = tenant?.shopDomain ?? "";

  const mutationPlan = job.mutationPlan as { action?: string; label?: string } | null;

  const { subject, text, html, slackText } = buildJobNotification(
    {
      type: job.type,
      status,
      fileName: job.fileName,
      nlPrompt: job.nlPrompt,
      impactSummary: job.impactSummary,
      errorSummary: job.errorSummary,
      rowCount: job.rowCount,
      successCount: job.successCount,
      failedCount: job.failedCount,
      mutationPlan,
    },
    shopLabel,
    shopDomain,
    status,
  );

  if (settings.slackWebhook && (status === "COMPLETED" || status === "FAILED")) {
    try {
      await fetch(settings.slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slackText }),
      });
    } catch {
      /* non-fatal */
    }
  }

  const shouldEmail =
    settings.email &&
    ((status === "COMPLETED" && settings.emailOnComplete) ||
      (status === "FAILED" && settings.emailOnFailure));

  if (shouldEmail && process.env.RESEND_API_KEY) {
    await sendEmail(settings.email!, subject, text, html);
  }
}
