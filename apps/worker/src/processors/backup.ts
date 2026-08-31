import fs from "node:fs";
import path from "node:path";
import { prisma } from "@tidysync/database";
import { fetchProductsForExport } from "../shopify-products";

export async function processBackupJob(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Backup job not found");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true },
  });
  const maxProducts = tenant?.plan?.maxBackupProducts ?? 250;
  const retentionDays = tenant?.plan?.backupRetentionDays ?? 7;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const label =
    (job.mutationPlan as { label?: string } | null)?.label ??
    `Backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  const filePath = path.join(backupDir, `${tenantId}-${jobId}.json`);

  try {
    const products = await fetchProductsForExport(shop, maxProducts);
    const payload = {
      version: 1,
      shop,
      createdAt: new Date().toISOString(),
      productCount: products.length,
      products,
    };

    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(filePath, json, "utf8");
    const sizeBytes = Buffer.byteLength(json, "utf8");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    await prisma.storeBackup.create({
      data: {
        tenantId,
        label,
        filePath,
        productCount: products.length,
        sizeBytes,
        status: "COMPLETED",
        jobId,
        expiresAt,
      },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        rowCount: products.length,
        successCount: products.length,
        filePath,
        fileName: path.basename(filePath),
      },
    });
  } catch (err) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: err instanceof Error ? err.message : "Backup failed",
      },
    });
    throw err;
  }
}
