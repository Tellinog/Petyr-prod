export const PETYR_LOGICAL_FIELDS = [
  "companyName",
  "csmName",
  "campaignName",
  "campaignStatus",
  "branch",
  "businessUnit",
  "campaignValue",
  "campaignCost",
  "grossMargin",
  "grossMarginPct",
  "campaignStartDate",
  "campaignEndDate",
  "campaignLink",
  "agreementName",
  "agreementValue",
  "agreementResidual",
  "agreementExpiryDate",
  "agreementLink"
] as const;

export type PetyrLogicalField = (typeof PETYR_LOGICAL_FIELDS)[number];

export const REDASH_PETYR_SOURCE_KEYS = ["master_campaigns", "master_agreements", "company_ownership"] as const;

export type RedashPetyrSourceKey = (typeof REDASH_PETYR_SOURCE_KEYS)[number];

export type RedashPetyrFieldMapping = {
  dbColumnName: string | null;
  note: string;
};

export type RedashPetyrSourceMapping = {
  sourceKey: RedashPetyrSourceKey;
  label: string;
  tableName: string;
  fields: Record<PetyrLogicalField, RedashPetyrFieldMapping>;
};

export const REDASH_PETYR_FIELD_MAPPINGS = {
  master_campaigns: {
    sourceKey: "master_campaigns",
    label: "Master campaigns",
    tableName: "redash_raw_master_campaigns_latest",
    fields: {
      companyName: {
        dbColumnName: "company_name",
        note: "Current customer/company name column in the materialized master_campaigns table."
      },
      csmName: {
        dbColumnName: "csm",
        note: "Current CSM owner column in the materialized master_campaigns table."
      },
      campaignName: {
        dbColumnName: "customer_title",
        note: "Current campaign display name column in the materialized master_campaigns table. Redash labels this counterintuitively; keep Petyr UI labels as campaign name."
      },
      campaignStatus: {
        dbColumnName: "status",
        note: "Current campaign lifecycle status column in the materialized master_campaigns table."
      },
      branch: {
        dbColumnName: null,
        note: "Not used for Petyr branch attribution: Branch comes only from company_ownership.company_branch."
      },
      businessUnit: {
        dbColumnName: "budget_group",
        note: "Current Business Unit source column in the materialized master_campaigns table."
      },
      campaignValue: {
        dbColumnName: "campaign_value",
        note: "Current campaign revenue/value column in the materialized master_campaigns table."
      },
      campaignCost: {
        dbColumnName: "total_campaign_costs",
        note: "Current total campaign cost column in the materialized master_campaigns table."
      },
      grossMargin: {
        dbColumnName: null,
        note: "Unknown: master_campaigns currently has gross_margin_pct but no direct gross margin amount column."
      },
      grossMarginPct: {
        dbColumnName: "gross_margin_pct",
        note: "Current gross margin percentage column in the materialized master_campaigns table."
      },
      campaignStartDate: {
        dbColumnName: "start_date",
        note: "Current campaign start date column in the materialized master_campaigns table."
      },
      campaignEndDate: {
        dbColumnName: "end_date",
        note: "Current campaign end date column in the materialized master_campaigns table."
      },
      campaignLink: {
        dbColumnName: "edit_link",
        note: "Current campaign edit/detail link column in the materialized master_campaigns table."
      },
      agreementName: {
        dbColumnName: "agreement",
        note: "Current agreement name column attached to campaign rows in the materialized master_campaigns table."
      },
      agreementValue: {
        dbColumnName: null,
        note: "Unknown for master_campaigns: agreement total value lives in master_agreements."
      },
      agreementResidual: {
        dbColumnName: null,
        note: "Unknown for master_campaigns: agreement residual value lives in master_agreements."
      },
      agreementExpiryDate: {
        dbColumnName: null,
        note: "Unknown for master_campaigns: agreement expiry date lives in master_agreements."
      },
      agreementLink: {
        dbColumnName: null,
        note: "Unknown: no current agreement URL column is materialized for master_campaigns."
      }
    }
  },
  master_agreements: {
    sourceKey: "master_agreements",
    label: "Master agreements",
    tableName: "redash_raw_master_agreements_latest",
    fields: {
      companyName: {
        dbColumnName: "company",
        note: "Current customer/company name column in the materialized master_agreements table."
      },
      csmName: {
        dbColumnName: "csm",
        note: "Current CSM owner column in the materialized master_agreements table."
      },
      campaignName: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign names are stored in master_campaigns."
      },
      campaignStatus: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign status is stored in master_campaigns."
      },
      branch: {
        dbColumnName: null,
        note: "Not used for Petyr branch attribution: Branch comes only from company_ownership.company_branch."
      },
      businessUnit: {
        dbColumnName: null,
        note: "Unknown: master_agreements has related_budget_groups, but not one canonical Petyr Business Unit."
      },
      campaignValue: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign value is stored in master_campaigns."
      },
      campaignCost: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign cost is stored in master_campaigns."
      },
      grossMargin: {
        dbColumnName: null,
        note: "Not available in master_agreements: gross margin amount is campaign-level data."
      },
      grossMarginPct: {
        dbColumnName: null,
        note: "Not available in master_agreements: gross margin percentage is campaign-level data."
      },
      campaignStartDate: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign dates are stored in master_campaigns."
      },
      campaignEndDate: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign dates are stored in master_campaigns."
      },
      campaignLink: {
        dbColumnName: null,
        note: "Not available in master_agreements: campaign links are stored in master_campaigns."
      },
      agreementName: {
        dbColumnName: "agreement_name",
        note: "Current agreement display name column in the materialized master_agreements table."
      },
      agreementValue: {
        dbColumnName: "agreement_amount_total",
        note: "Current total agreement amount column in the materialized master_agreements table."
      },
      agreementResidual: {
        dbColumnName: "agreement_amount_residual_eur",
        note: "Current residual agreement amount column in the materialized master_agreements table."
      },
      agreementExpiryDate: {
        dbColumnName: "agreement_expiry_date",
        note: "Current agreement expiry date column in the materialized master_agreements table."
      },
      agreementLink: {
        dbColumnName: null,
        note: "Unknown: no current agreement URL column is materialized for master_agreements."
      }
    }
  },
  company_ownership: {
    sourceKey: "company_ownership",
    label: "Company ownership",
    tableName: "redash_raw_company_ownership_latest",
    fields: {
      companyName: {
        dbColumnName: "company_name",
        note: "Canonical company display name from Redash query 1685."
      },
      csmName: {
        dbColumnName: "csm_name",
        note: "Canonical current CSM owner from Redash query 1685."
      },
      campaignName: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign names are stored in master_campaigns."
      },
      campaignStatus: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign status is stored in master_campaigns."
      },
      branch: {
        dbColumnName: "company_branch",
        note: "Canonical company branch from Redash query 1685."
      },
      businessUnit: {
        dbColumnName: null,
        note: "Not available in company_ownership: Business Unit is campaign-level data."
      },
      campaignValue: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign value is stored in master_campaigns."
      },
      campaignCost: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign cost is stored in master_campaigns."
      },
      grossMargin: {
        dbColumnName: null,
        note: "Not available in company_ownership: gross margin is campaign-level data."
      },
      grossMarginPct: {
        dbColumnName: null,
        note: "Not available in company_ownership: gross margin percentage is campaign-level data."
      },
      campaignStartDate: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign dates are stored in master_campaigns."
      },
      campaignEndDate: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign dates are stored in master_campaigns."
      },
      campaignLink: {
        dbColumnName: null,
        note: "Not available in company_ownership: campaign links are stored in master_campaigns."
      },
      agreementName: {
        dbColumnName: null,
        note: "Not available in company_ownership: agreement names are stored in master_agreements."
      },
      agreementValue: {
        dbColumnName: null,
        note: "Not available in company_ownership: agreement total value lives in master_agreements."
      },
      agreementResidual: {
        dbColumnName: null,
        note: "Not available in company_ownership: agreement residual value lives in master_agreements."
      },
      agreementExpiryDate: {
        dbColumnName: null,
        note: "Not available in company_ownership: agreement expiry date lives in master_agreements."
      },
      agreementLink: {
        dbColumnName: null,
        note: "Not available in company_ownership: agreement URLs are not part of ownership."
      }
    }
  }
} satisfies Record<RedashPetyrSourceKey, RedashPetyrSourceMapping>;

export function getRedashPetyrSourceMappings() {
  return REDASH_PETYR_SOURCE_KEYS.map((sourceKey) => REDASH_PETYR_FIELD_MAPPINGS[sourceKey]);
}

export function getRedashPetyrSourceMapping(sourceKey: RedashPetyrSourceKey) {
  return REDASH_PETYR_FIELD_MAPPINGS[sourceKey];
}

export function getMappedDbColumn(sourceKey: RedashPetyrSourceKey, logicalField: PetyrLogicalField) {
  return REDASH_PETYR_FIELD_MAPPINGS[sourceKey].fields[logicalField].dbColumnName;
}
