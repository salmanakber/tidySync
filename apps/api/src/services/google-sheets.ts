import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type FeedSyncMode = "create" | "update_by_sku" | "update_by_barcode" | "upsert";
export type FeedMatchField = "variants.sku" | "variants.barcode";

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetGid?: string;
  sheetName?: string;
  direction?: "import" | "export";
  lastSyncAt?: string;
  /** Live feed: match existing products instead of only creating new ones */
  syncMode?: FeedSyncMode;
  matchField?: FeedMatchField;
  schedule?: string;
  autoSyncEnabled?: boolean;
  autoApprove?: boolean;
  savedMappings?: Array<{ sourceColumn: string; targetField: string }>;
  savedDefaults?: {
    title?: string;
    price?: string;
    vendor?: string;
    status?: string;
    skuPrefix?: string;
  };
}

export function parseSpreadsheetUrl(input: string): { spreadsheetId: string; gid?: string } | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return { spreadsheetId: trimmed };
  }

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;

  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch?.[1],
  };
}

export function buildSheetsCsvExportUrl(spreadsheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : `${base}&gid=0`;
}

export async function downloadGoogleSheetCsv(
  spreadsheetId: string,
  gid?: string,
): Promise<{ filePath: string; fileName: string; rowEstimate: number }> {
  const url = buildSheetsCsvExportUrl(spreadsheetId, gid);
  const res = await fetch(url, {
    headers: { "User-Agent": "TidySync/1.0" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `Could not download Google Sheet (HTTP ${res.status}). Share the sheet as "Anyone with the link can view" or publish it to the web.`,
    );
  }

  const text = await res.text();
  if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
    throw new Error(
      "Google returned a web page instead of CSV. Share the spreadsheet publicly or use Link sharing: Anyone with the link → Viewer.",
    );
  }

  const rowEstimate = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const fileName = `google-sheet-${spreadsheetId.slice(0, 8)}.csv`;
  const filePath = path.join(os.tmpdir(), `tidysync-${Date.now()}-${fileName}`);
  fs.writeFileSync(filePath, text, "utf8");

  return { filePath, fileName, rowEstimate };
}
