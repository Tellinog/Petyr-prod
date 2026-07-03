"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PetyrForecastNavigatorShell,
  PetyrPreviousNextControl,
  PetyrSelectField
} from "@/components/petyr/PetyrForecastNavigation";

export type CompanyDetailNavigationOption = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

type CompanyDetailNavigatorProps = {
  companies: CompanyDetailNavigationOption[];
  selectedCompanyName: string;
  selectedCsmName: string;
  selectedYear: number;
  preferredCsmName?: string | null;
};

function buildCompanyDetailPageUrl(companyName: string, year: number, csmName?: string | null) {
  const params = new URLSearchParams({ year: String(year) });
  if (csmName) params.set("csmName", csmName);
  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function parseYearInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

export function CompanyDetailNavigator({
  companies,
  selectedCompanyName,
  selectedCsmName,
  selectedYear,
  preferredCsmName = null
}: CompanyDetailNavigatorProps) {
  const [csmFilter, setCsmFilter] = useState(() => {
    const selected = selectedCsmName || "Unassigned";
    return preferredCsmName && normalizeKey(preferredCsmName) === normalizeKey(selected) ? preferredCsmName : selected;
  });
  const [yearInput, setYearInput] = useState(String(selectedYear));
  useEffect(() => {
    const selected = selectedCsmName || "Unassigned";
    setCsmFilter(preferredCsmName && normalizeKey(preferredCsmName) === normalizeKey(selected) ? preferredCsmName : selected);
  }, [preferredCsmName, selectedCsmName, selectedCompanyName]);

  useEffect(() => {
    setYearInput(String(selectedYear));
  }, [selectedYear]);

  const csmOptions = useMemo(() => {
    const csmNames = [...new Set(companies.map((company) => company.csmName || "Unassigned"))].sort((left, right) =>
      left.localeCompare(right)
    );

    return csmFilter && !csmNames.includes(csmFilter) ? [csmFilter, ...csmNames] : csmNames;
  }, [companies, csmFilter]);
  const filteredCompanyOptions = useMemo(() => {
    const csmKey = normalizeKey(csmFilter);
    if (!csmKey) return companies;

    return companies.filter((company) => normalizeKey(company.csmName || "Unassigned") === csmKey);
  }, [companies, csmFilter]);
  const selectedCompanyOption = useMemo(
    () =>
      companies.find(
        (company) =>
          normalizeKey(company.companyName) === normalizeKey(selectedCompanyName) &&
          normalizeKey(company.csmName || "Unassigned") === normalizeKey(csmFilter)
      ) ?? companies.find((company) => normalizeKey(company.companyName) === normalizeKey(selectedCompanyName)),
    [companies, csmFilter, selectedCompanyName]
  );
  const visibleCompanyOptions = useMemo(() => {
    if (!selectedCompanyOption) return filteredCompanyOptions;
    if (filteredCompanyOptions.some((company) => company.companyName === selectedCompanyOption.companyName)) return filteredCompanyOptions;

    return [selectedCompanyOption, ...filteredCompanyOptions];
  }, [filteredCompanyOptions, selectedCompanyOption]);
  const selectedCompanyIndex = visibleCompanyOptions.findIndex((company) => normalizeKey(company.companyName) === normalizeKey(selectedCompanyName));
  const companyCounter = visibleCompanyOptions.length > 0 && selectedCompanyIndex >= 0
    ? `${selectedCompanyIndex + 1} / ${visibleCompanyOptions.length}`
    : "0 / 0";
  const canNavigateCompany = visibleCompanyOptions.length > 1 && selectedCompanyIndex >= 0;
  const nextYear = parseYearInput(yearInput, selectedYear);

  function openCompany(companyName: string, year = nextYear) {
    if (!companyName) return;
    window.location.assign(buildCompanyDetailPageUrl(companyName, year, csmFilter));
  }

  function handleCsmChange(csmName: string) {
    setCsmFilter(csmName);
    const firstCompanyForCsm = companies.find((company) => normalizeKey(company.csmName || "Unassigned") === normalizeKey(csmName));
    if (firstCompanyForCsm) window.location.assign(buildCompanyDetailPageUrl(firstCompanyForCsm.companyName, nextYear, csmName));
  }

  function navigateCompany(direction: -1 | 1) {
    if (!canNavigateCompany) return;

    const nextIndex = (selectedCompanyIndex + direction + visibleCompanyOptions.length) % visibleCompanyOptions.length;
    const nextCompany = visibleCompanyOptions[nextIndex];
    if (nextCompany) openCompany(nextCompany.companyName);
  }

  return (
    <PetyrForecastNavigatorShell
      csmSlot={
        <PetyrSelectField
          label="CSM filter"
          disabled={companies.length === 0 || csmOptions.length === 0}
          value={csmFilter}
          onChange={(event) => handleCsmChange(event.target.value)}
        >
          {csmOptions.length === 0 ? <option value="">No CSM data</option> : null}
          {csmOptions.map((csmName) => (
            <option key={csmName} value={csmName}>
              {csmName}
            </option>
          ))}
        </PetyrSelectField>
      }
      companySlot={
        <PetyrSelectField
          label="Company"
          disabled={visibleCompanyOptions.length === 0}
          value={selectedCompanyName}
          onChange={(event) => openCompany(event.target.value)}
        >
          {visibleCompanyOptions.length === 0 ? <option value="">No company data</option> : null}
          {visibleCompanyOptions.map((company) => (
            <option key={company.companyName} value={company.companyName}>
              {company.companyName}
            </option>
          ))}
        </PetyrSelectField>
      }
      navigationSlot={
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(360px,1fr)] lg:items-end">
          <div className="space-y-2">
            <div className="text-sm text-slate-500">Year</div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={2000}
                max={2100}
                value={yearInput}
                onChange={(event) => setYearInput(event.target.value)}
              />
              <Button variant="outline" type="button" onClick={() => openCompany(selectedCompanyName, nextYear)}>
                Load
              </Button>
            </div>
          </div>
          <PetyrPreviousNextControl
            counter={companyCounter}
            helperText={selectedCompanyOption?.isForecastActive === false ? "Inactive company" : undefined}
            previousDisabled={!canNavigateCompany}
            nextDisabled={!canNavigateCompany}
            onPrevious={() => navigateCompany(-1)}
            onNext={() => navigateCompany(1)}
          />
        </div>
      }
    />
  );
}
