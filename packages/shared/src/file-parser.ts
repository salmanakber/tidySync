import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import ExcelJS from "exceljs";

function cellValuesToStrings(row: ExcelJS.Row): string[] {
  const values = row.values as ExcelJS.CellValue[];
  if (!values || !Array.isArray(values)) return [];
  return values.slice(1).map((v) => String(v ?? "").trim()).filter((s, i, arr) => i === 0 || s !== "" || arr.length > 1);
}

export async function parseFileHeaders(filePath: string): Promise<string[]> {
  if (filePath.endsWith(".xlsx") || filePath.endsWith(".xls")) {
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

export async function parseFilePreview(
  filePath: string,
  maxRows: number,
): Promise<Record<string, string>[]> {
  if (filePath.endsWith(".xlsx") || filePath.endsWith(".xls")) {
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
  if (filePath.endsWith(".xlsx") || filePath.endsWith(".xls")) {
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
