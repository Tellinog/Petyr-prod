export type PreviewColumn = {
  name: string;
  friendlyName?: string;
  type?: string;
};

export type PreviewRow = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNestedRecord(value: unknown, path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }

  return current;
}

function normalizeColumn(column: unknown): PreviewColumn | null {
  if (typeof column === "string") {
    return { name: column };
  }

  if (!isRecord(column)) return null;

  const rawName = column.name ?? column.friendly_name ?? column.title;
  if (typeof rawName !== "string" || !rawName.trim()) return null;

  return {
    name: rawName,
    friendlyName: typeof column.friendly_name === "string" ? column.friendly_name : undefined,
    type: typeof column.type === "string" ? column.type : undefined
  };
}

export function extractRedashColumns(payload: unknown): PreviewColumn[] {
  const rawColumns = getNestedRecord(payload, ["query_result", "data", "columns"]);

  if (Array.isArray(rawColumns)) {
    return rawColumns.map(normalizeColumn).filter((column): column is PreviewColumn => Boolean(column));
  }

  return [];
}

export function extractRedashRows(payload: unknown): PreviewRow[] {
  const rawRows = getNestedRecord(payload, ["query_result", "data", "rows"]);

  if (!Array.isArray(rawRows)) return [];

  return rawRows.filter(isRecord).map((row) => row as PreviewRow);
}

export function inferColumnNamesFromRows(rows: PreviewRow[], maxColumns = 30): PreviewColumn[] {
  const names = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      names.add(key);
      if (names.size >= maxColumns) break;
    }
    if (names.size >= maxColumns) break;
  }

  return [...names].map((name) => ({ name }));
}

export function buildRedashPreview(payload: unknown, limit = 50) {
  const rows = extractRedashRows(payload);
  const columns = extractRedashColumns(payload);
  const effectiveColumns = columns.length ? columns : inferColumnNamesFromRows(rows);

  return {
    columns: effectiveColumns,
    rows: rows.slice(0, limit),
    totalRowsInPayload: rows.length
  };
}

export function formatPreviewCell(value: unknown, maxLength = 90) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const serialized = JSON.stringify(value);
  if (!serialized) return "—";
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}…` : serialized;
}
