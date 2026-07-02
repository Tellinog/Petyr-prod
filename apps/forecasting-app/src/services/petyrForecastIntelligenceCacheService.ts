import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
  PETYR_FORECAST_INTELLIGENCE_CACHE_MONTH
} from "@/lib/petyr/constants";
import type {
  PetyrForecastIntelligenceCacheAdapter,
  PetyrForecastIntelligenceCacheWrite,
  PetyrForecastIntelligenceOutput,
  PetyrLatestCompanyIntelligence
} from "@/services/petyrForecastIntelligenceService";
import { selectLatestSuccessfulPetyrCompanyIntelligence } from "@/services/petyrForecastIntelligenceService";

export type { PetyrLatestCompanyIntelligence } from "@/services/petyrForecastIntelligenceService";

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function isOutput(value: unknown): value is PetyrForecastIntelligenceOutput {
  return typeof value === "object" && value !== null;
}

function modelVersionForIntelligenceCache(input: Pick<PetyrForecastIntelligenceCacheWrite, "model" | "promptVersion" | "inputHash">) {
  return ["forecast_intelligence", input.model, input.promptVersion, input.inputHash].join(":");
}

export function createPetyrForecastIntelligenceCacheAdapter(input: {
  companyName: string;
  year: number;
}): PetyrForecastIntelligenceCacheAdapter {
  async function findExisting(write: Pick<PetyrForecastIntelligenceCacheWrite, "provider" | "model" | "promptVersion" | "inputHash">) {
    return prisma.aiForecastCache.findFirst({
      where: {
        companyName: input.companyName,
        businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
        year: input.year,
        month: PETYR_FORECAST_INTELLIGENCE_CACHE_MONTH,
        provider: write.provider,
        providerModel: write.model,
        promptVersion: write.promptVersion,
        inputHash: write.inputHash
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  return {
    async findSuccessful(read) {
      const row = await prisma.aiForecastCache.findFirst({
        where: {
          companyName: input.companyName,
          businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
          year: input.year,
          month: PETYR_FORECAST_INTELLIGENCE_CACHE_MONTH,
          provider: read.provider,
          providerModel: read.model,
          modelVersion: modelVersionForIntelligenceCache(read),
          promptVersion: read.promptVersion,
          inputHash: read.inputHash,
          status: "success",
          validatedOutput: { not: Prisma.JsonNull }
        },
        orderBy: { updatedAt: "desc" }
      });

      if (!row || !isOutput(row.validatedOutput)) return null;

      return {
        output: row.validatedOutput,
        generatedAt: row.generatedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    },

    async save(write) {
      const existing = await findExisting(write);
      const generatedAt = new Date();
      const data = {
        companyName: input.companyName,
        businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
        year: input.year,
        month: PETYR_FORECAST_INTELLIGENCE_CACHE_MONTH,
        forecastValue: new Prisma.Decimal(0),
        confidenceScore: null,
        modelVersion: modelVersionForIntelligenceCache(write),
        explanation: write.validatedOutput?.stakeholder_notes[0]?.note ?? write.errorMessage,
        generatedAt,
        provider: write.provider,
        providerModel: write.model,
        promptVersion: write.promptVersion,
        inputHash: write.inputHash,
        requestPayloadSummary: asJson(write.requestPayloadSummary),
        validatedOutput: write.validatedOutput ? asJson(write.validatedOutput) : Prisma.JsonNull,
        status: write.status,
        errorMessage: write.errorMessage
      };

      if (existing) {
        const updated = await prisma.aiForecastCache.update({
          where: { id: existing.id },
          data
        });
        return { action: "updated" as const, generatedAt: updated.generatedAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
      }

      const created = await prisma.aiForecastCache.create({ data });
      return { action: "created" as const, generatedAt: created.generatedAt.toISOString(), updatedAt: created.updatedAt.toISOString() };
    }
  };
}

export async function getLatestPetyrCompanyIntelligence(input: {
  companyName: string;
  year: number;
}): Promise<PetyrLatestCompanyIntelligence | null> {
  const rows = await prisma.aiForecastCache.findMany({
    where: {
      companyName: input.companyName,
      businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
      year: input.year,
      month: PETYR_FORECAST_INTELLIGENCE_CACHE_MONTH,
      forecastValue: new Prisma.Decimal(0),
      status: "success",
      validatedOutput: { not: Prisma.JsonNull }
    },
    orderBy: [
      { generatedAt: "desc" },
      { updatedAt: "desc" }
    ],
    take: 10
  });

  return selectLatestSuccessfulPetyrCompanyIntelligence(rows);
}
