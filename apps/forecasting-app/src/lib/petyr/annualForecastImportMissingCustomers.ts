export type AnnualForecastImportOwnershipCustomer = {
  companyName: string;
  csmName: string;
};

function normalizeCompanyKey(value: string) {
  return value.trim().toLowerCase();
}

export function getMissingAnnualForecastImportCustomers(input: {
  importedCompanyNames: string[];
  ownershipPairs: AnnualForecastImportOwnershipCustomer[];
  inactiveCompanyNames?: string[];
}) {
  const importedKeys = new Set(input.importedCompanyNames.map(normalizeCompanyKey));
  const inactiveKeys = new Set((input.inactiveCompanyNames ?? []).map(normalizeCompanyKey));

  return input.ownershipPairs
    .filter((ownership) => {
      const companyKey = normalizeCompanyKey(ownership.companyName);
      return !importedKeys.has(companyKey) && !inactiveKeys.has(companyKey);
    })
    .sort((left, right) => left.companyName.localeCompare(right.companyName));
}
