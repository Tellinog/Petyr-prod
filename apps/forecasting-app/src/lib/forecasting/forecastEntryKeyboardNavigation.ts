export type ForecastEntryNavigationDirection = "left" | "right" | "up" | "down";

function directionForKey(input: HTMLInputElement, key: string): ForecastEntryNavigationDirection | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";

  const selectionStart = input.selectionStart ?? 0;
  const selectionEnd = input.selectionEnd ?? selectionStart;

  if (key === "ArrowLeft" && selectionStart === 0 && selectionEnd === 0) return "left";
  if (key === "ArrowRight" && selectionStart === input.value.length && selectionEnd === input.value.length) return "right";

  return null;
}

/**
 * Returns the adjacent editable forecast cell in the current batch table.
 * Horizontal navigation keeps the company row; vertical navigation keeps the
 * visible forecast column. Left/right retain normal text-caret behavior until
 * the cursor reaches the corresponding edge of the value.
 */
export function forecastEntryNavigationTarget(input: HTMLInputElement, key: string) {
  const direction = directionForKey(input, key);
  const table = input.closest("table");
  const row = input.dataset.forecastEntryRow;
  const column = input.dataset.forecastEntryColumn;

  if (!direction || !table || !row || !column) return null;

  const inputs = [...table.querySelectorAll<HTMLInputElement>("input[data-forecast-entry-row][data-forecast-entry-column]")]
    .filter((candidate) => !candidate.disabled && !candidate.readOnly);

  if (direction === "left" || direction === "right") {
    const rowInputs = inputs.filter((candidate) => candidate.dataset.forecastEntryRow === row);
    const index = rowInputs.indexOf(input);
    return rowInputs[index + (direction === "left" ? -1 : 1)] ?? null;
  }

  const columnInputs = inputs.filter((candidate) => candidate.dataset.forecastEntryColumn === column);
  const index = columnInputs.indexOf(input);
  return columnInputs[index + (direction === "up" ? -1 : 1)] ?? null;
}

export function focusForecastEntryNavigationTarget(target: HTMLInputElement | null) {
  if (!target) return false;

  target.focus();
  target.select();
  return true;
}
