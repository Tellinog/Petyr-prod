export type PetyrNumericValue = number | string | null | undefined;

export const PETYR_EXCEL_CURRENCY_NUM_FORMAT = '#,##0.00 "€"';
export const PETYR_EXCEL_PERCENT_NUM_FORMAT = "0.00%";

function groupItalianIntegerDigits(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parsePetyrNumericValue(value: PetyrNumericValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let normalized = value.trim().replace(/\s+/g, "").replace(/EUR|€/gi, "");
  if (!normalized) return null;

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPetyrNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";

  const sign = value < 0 ? "-" : "";
  const [integerPart, decimalPart] = Math.abs(value).toFixed(2).split(".");

  return `${sign}${groupItalianIntegerDigits(integerPart)},${decimalPart}`;
}

export function formatPetyrCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${formatPetyrNumber(value)} €`;
}

export function formatPetyrPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${formatPetyrNumber(value)}%`;
}

export function formatPetyrInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";

  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";

  return `${sign}${groupItalianIntegerDigits(String(Math.abs(rounded)))}`;
}

export function formatPetyrNumberValue(value: PetyrNumericValue): string {
  return formatPetyrNumber(parsePetyrNumericValue(value));
}

export function formatPetyrCurrencyValue(value: PetyrNumericValue): string {
  return formatPetyrCurrency(parsePetyrNumericValue(value));
}

export function formatPetyrPercentValue(value: PetyrNumericValue): string {
  return formatPetyrPercent(parsePetyrNumericValue(value));
}
