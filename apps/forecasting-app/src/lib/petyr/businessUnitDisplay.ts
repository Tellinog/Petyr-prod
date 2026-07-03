export function formatBusinessUnitDisplayName(businessUnit: string) {
  if (businessUnit === "Other") return "OTHER";
  return businessUnit === "Experience" ? "UX" : businessUnit;
}
