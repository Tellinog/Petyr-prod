export const PETYR_COMPANY_REVENUE_LIFECYCLE_STATUSES = [
  "existing",
  "new_business",
  "reactivated"
] as const;

export type PetyrCompanyRevenueLifecycleStatus = typeof PETYR_COMPANY_REVENUE_LIFECYCLE_STATUSES[number];

export function classifyCompanyRevenueLifecycle(input: {
  currentYearRevenue: number;
  previousYearRevenue: number;
  twoYearsAgoRevenue: number;
}): PetyrCompanyRevenueLifecycleStatus | null {
  if (input.currentYearRevenue <= 0) return null;
  if (input.previousYearRevenue > 0) return "existing";
  if (input.twoYearsAgoRevenue > 0) return "reactivated";
  return "new_business";
}

export function companyRevenueLifecycleLabel(status: PetyrCompanyRevenueLifecycleStatus) {
  if (status === "existing") return "Existing";
  if (status === "new_business") return "New business";
  return "Reactivated";
}
