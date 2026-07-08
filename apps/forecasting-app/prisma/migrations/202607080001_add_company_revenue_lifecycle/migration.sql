CREATE TYPE "CompanyRevenueLifecycleStatus" AS ENUM ('existing', 'new_business', 'reactivated');

CREATE TABLE "company_revenue_lifecycle" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "status" "CompanyRevenueLifecycleStatus",
  "current_year_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "previous_year_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "two_years_ago_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "has_current_year_revenue" BOOLEAN NOT NULL DEFAULT false,
  "has_previous_year_revenue" BOOLEAN NOT NULL DEFAULT false,
  "has_two_years_ago_revenue" BOOLEAN NOT NULL DEFAULT false,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_revenue_lifecycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_revenue_lifecycle_company_year_key" ON "company_revenue_lifecycle"("company_name", "year");
CREATE INDEX "company_revenue_lifecycle_status_year_idx" ON "company_revenue_lifecycle"("status", "year");
CREATE INDEX "company_revenue_lifecycle_year_idx" ON "company_revenue_lifecycle"("year");
