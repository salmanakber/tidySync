import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import ExcelJS from "exceljs";

type StreamRow = ExcelJS.Row;

function cellValuesToStrings(row: StreamRow): string[] {
  const values = row.values as ExcelJS.CellValue[];
  if (!values || !Array.isArray(values)) return [];
  return values
    .slice(1)
    .map((v) => String(v ?? "").trim())
    .filter((s, i, arr) => i === 0 || s !== "" || arr.length > 1);
}

function isXlsx(filePath: string) {
  return filePath.endsWith(".xlsx");
}

function isLegacyXls(filePath: string) {
  return filePath.endsWith(".xls") && !filePath.endsWith(".xlsx");
}

async function firstXlsxSheetRows(
  filePath: string,
  maxRows: number,
): Promise<{ headers: string[]; rows: StreamRow[] }> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "emit",
    styles: "cache",
  });

  for await (const worksheetReader of reader) {
    const rows: StreamRow[] = [];
    let headers: string[] = [];
    for await (const row of worksheetReader) {
      if (rows.length === 0) {
        headers = cellValuesToStrings(row).filter(Boolean);
        rows.push(row);
        continue;
      }
      rows.push(row);
      if (rows.length > maxRows) break;
    }
    return { headers, rows };
  }
  return { headers: [], rows: [] };
}

function rowToRecord(headers: string[], row: StreamRow): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((h, idx) => {
    if (h) record[h] = String(row.getCell(idx + 1).value ?? "");
  });
  return record;
}

export async function parseFileHeaders(filePath: string): Promise<string[]> {
  if (isXlsx(filePath)) {
    const { headers } = await firstXlsxSheetRows(filePath, 1);
    return headers;
  }

  if (isLegacyXls(filePath)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    return cellValuesToStrings(sheet.getRow(1)).filter(Boolean);
  }

  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, to: 1, relax_column_count: true }),
  );
  for await (const record of parser) {
    return Object.keys(record as Record<string, string>);
  }
  return [];
}

export async function countFileRows(filePath: string): Promise<number> {
  if (isXlsx(filePath)) {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      entries: "emit",
      sharedStrings: "cache",
      hyperlinks: "emit",
      styles: "cache",
    });
    let count = 0;
    for await (const worksheetReader of reader) {
      for await (const row of worksheetReader) {
        if (row.number <= 1) continue;
        count++;
      }
      break;
    }
    return count;
  }

  if (isLegacyXls(filePath)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount <= 1) return 0;
    return sheet.rowCount - 1;
  }

  let count = 0;
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, relax_column_count: true }),
  );
  for await (const _record of parser) {
    count++;
  }
  return count;
}

export async function parseFilePreview(
  filePath: string,
  maxRows: number,
): Promise<Record<string, string>[]> {
  if (isXlsx(filePath)) {
    const { headers, rows } = await firstXlsxSheetRows(filePath, maxRows + 1);
    return rows.slice(1, maxRows + 1).map((row) => rowToRecord(headers, row));
  }

  if (isLegacyXls(filePath)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers = cellValuesToStrings(sheet.getRow(1));
    const rows: Record<string, string>[] = [];
    for (let i = 2; i <= sheet.rowCount && rows.length < maxRows; i++) {
      const row = sheet.getRow(i);
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (h) record[h] = String(row.getCell(idx + 1).value ?? "");
      });
      rows.push(record);
    }
    return rows;
  }

  const rows: Record<string, string>[] = [];
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, relax_column_count: true }),
  );
  for await (const record of parser) {
    rows.push(record as Record<string, string>);
    if (rows.length >= maxRows) break;
  }
  return rows;
}

export async function streamFileRows(
  filePath: string,
  onRow: (row: Record<string, string>, index: number) => Promise<void>,
): Promise<number> {
  if (isXlsx(filePath)) {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      entries: "emit",
      sharedStrings: "cache",
      hyperlinks: "emit",
      styles: "cache",
    });
    let headers: string[] = [];
    let index = 0;
    for await (const worksheetReader of reader) {
      for await (const row of worksheetReader) {
        if (row.number === 1) {
          headers = cellValuesToStrings(row).filter(Boolean);
          continue;
        }
        const record = rowToRecord(headers, row);
        await onRow(record, index);
        index++;
      }
      break;
    }
    return index;
  }

  if (isLegacyXls(filePath)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return 0;
    const headers = cellValuesToStrings(sheet.getRow(1));
    let index = 0;
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (h) record[h] = String(row.getCell(idx + 1).value ?? "");
      });
      await onRow(record, index);
      index++;
    }
    return index;
  }

  let index = 0;
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, relax_column_count: true }),
  );
  for await (const record of parser) {
    await onRow(record as Record<string, string>, index);
    index++;
  }
  return index;
}
