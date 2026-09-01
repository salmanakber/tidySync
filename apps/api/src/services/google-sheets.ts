import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type FeedSyncMode = "create" | "update_by_sku" | "update_by_barcode" | "upsert";
export type FeedMatchField = "variants.sku" | "variants.barcode";

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetGid?: string;
  sheetName?: string;
  /** Published-to-web link (/d/e/2PACX-...) */
  published?: boolean;
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

export interface ParsedSpreadsheetUrl {
  spreadsheetId: string;
  gid?: string;
  published?: boolean;
}

export function parseSpreadsheetUrl(input: string): ParsedSpreadsheetUrl | null {
  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return { spreadsheetId: trimmed };
  }

  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);

  // Published to web: /spreadsheets/d/e/{pubId}/pub or /pubhtml
  const publishedMatch = trimmed.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (publishedMatch) {
    return {
      spreadsheetId: publishedMatch[1],
      gid: gidMatch?.[1],
      published: true,
    };
  }

  // Standard share link: /spreadsheets/d/{id}/edit (not /d/e/)
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!idMatch) return null;

  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch?.[1],
    published: false,
  };
}

export function buildSheetsCsvExportUrls(
  spreadsheetId: string,
  gid?: string,
  options?: { published?: boolean; sheetName?: string },
): string[] {
  const g = gid ?? "0";
  const urls: string[] = [];

  if (options?.published) {
    urls.push(
      `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?gid=${g}&single=true&output=csv`,
      `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?output=csv&gid=${g}`,
    );
  }

  urls.push(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${g}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${g}`,
  );

  if (options?.sheetName?.trim()) {
    urls.push(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(options.sheetName.trim())}`,
    );
  }

  // Last resort: first tab without explicit gid (some public sheets reject gid=0)
  if (g !== "0") {
    urls.push(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`,
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`,
    );
  }

  return urls;
}

/** @deprecated use buildSheetsCsvExportUrls */
export function buildSheetsCsvExportUrl(spreadsheetId: string, gid?: string): string {
  return buildSheetsCsvExportUrls(spreadsheetId, gid)[0];
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 800).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html");
}

export async function downloadGoogleSheetCsv(
  spreadsheetId: string,
  gid?: string,
  options?: { published?: boolean; sheetName?: string },
): Promise<{ filePath: string; fileName: string; rowEstimate: number }> {
  const urls = buildSheetsCsvExportUrls(spreadsheetId, gid, options);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (compatible; TidySync/1.0; +https://sync.tidyflowapp.com)",
    Accept: "text/csv,text/plain,application/csv,*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  let lastStatus = 0;

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, redirect: "follow" });
      if (!res.ok) {
        lastStatus = res.status;
        continue;
      }
      const text = await res.text();
      if (!text.trim() || looksLikeHtml(text)) continue;

      const rowEstimate = text.split(/\r?\n/).filter((l) => l.trim()).length;
      if (rowEstimate < 1) continue;

      const fileName = `google-sheet-${spreadsheetId.slice(0, 8)}.csv`;
      const filePath = path.join(os.tmpdir(), `tidysync-${Date.now()}-${fileName}`);
      fs.writeFileSync(filePath, text, "utf8");

      return { filePath, fileName, rowEstimate };
    } catch {
      /* try next URL */
    }
  }

  const hint =
    lastStatus === 400 || lastStatus === 403
      ? "Open the sheet link in a private browser tab (not logged into Google). If it asks to sign in, set General access to “Anyone with the link” → Viewer. For Publish to web links, paste the full published URL. If you use a specific tab, copy the URL while that tab is selected (#gid=… in the address bar)."
      : "Share the sheet as Anyone with the link can view, or publish it to the web.";

  throw new Error(
    `Could not download Google Sheet (HTTP ${lastStatus || "error"}). ${hint}`,
  );
}
