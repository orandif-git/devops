import { ColumnDef, GridConfig, GridRow } from "../core/types";
import { coerce, normalizeRow } from "../core/gridModel";
import { parseCsv, toCsv } from "../core/csv";
import { formatDateText } from "../core/dateFormat";

const cellText = (c: ColumnDef, v: unknown) => (c.type === "boolean" ? (v ? "Yes" : "No") : v === null || v === undefined ? "" : c.displayFormat ? formatDateText(v, c.displayFormat) : String(v));

export function exportCsv(rows: GridRow[], cfg: GridConfig): string {
  return toCsv([cfg.columns.map(c => c.name), ...rows.map(r => cfg.columns.map(c => cellText(c, r[c.id])))]);
}

export async function exportXlsx(rows: GridRow[], cfg: GridConfig): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = cfg.columns.map(c => ({ value: c.name, fontWeight: "bold" as const }));
  const body = rows.map(r => cfg.columns.map(c => {
    const v = r[c.id];
    if (c.type === "number" && typeof v === "number") return { type: Number, value: v };
    return { type: String, value: cellText(c, v) };
  }));
  return writeExcelFile([head, ...body] as never).toBlob();
}

/** Map a 2D array (first row = header) onto grid rows by header text or column id. */
export function rowsFromMatrix(matrix: unknown[][], cfg: GridConfig): { rows: GridRow[]; unmatched: string[] } {
  if (!matrix.length) return { rows: [], unmatched: [] };
  const header = matrix[0].map(h => String(h ?? "").trim().toLowerCase());
  const index = cfg.columns.map(c => header.findIndex(h => h === c.name.toLowerCase() || h === c.id.toLowerCase()));
  const unmatched = cfg.columns.filter((_, i) => index[i] < 0).map(c => c.name);
  const rows = matrix.slice(1).filter(r => r.some(v => v !== null && v !== undefined && String(v).trim() !== "")).map(r => {
    const src: Record<string, unknown> = {};
    cfg.columns.forEach((c, i) => { if (index[i] >= 0 && !c.formula && !c.lookup && !c.teamFrom) src[c.id] = coerce(c, r[index[i]]); });
    return normalizeRow(src, cfg);
  });
  return { rows, unmatched };
}

export async function importFile(file: File, cfg: GridConfig) {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return rowsFromMatrix((await readSheet(file)) as unknown[][], cfg);
  }
  return rowsFromMatrix(parseCsv(await file.text()), cfg);
}
