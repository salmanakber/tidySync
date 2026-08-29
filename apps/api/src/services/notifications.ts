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

export async function sendEmail(to: string, subject: string, text: string) {
  const client = getResendClient();
  if (!client) return false;

  try {
    const { error } = await client.emails.send({
      from: resendFromAddress(),
      to,
      subject,
      text,
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
  const subject = `TidySync job ${status}: ${job?.type ?? "job"}`;
  const body = `Job ${jobId} finished with status ${status}. Rows: ${job?.successCount}/${job?.rowCount}`;

  if (settings.slackWebhook && (status === "COMPLETED" || status === "FAILED")) {
    try {
      await fetch(settings.slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
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
    await sendEmail(settings.email!, subject, body);
  }
}
