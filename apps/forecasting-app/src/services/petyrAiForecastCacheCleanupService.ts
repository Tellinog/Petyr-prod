import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT } from "@/lib/petyr/constants";

type AiForecastCacheClient = Pick<Prisma.TransactionClient, "aiForecastCache">;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function clearNumericAiForecastCacheForCompany(input: {
  companyName: string;
  tx?: AiForecastCacheClient;
}) {
  const companyName = asString(input.companyName);
  if (!companyName) return { deletedRows: 0 };

  const client = input.tx ?? prisma;
  const result = await client.aiForecastCache.deleteMany({
    where: {
      companyName,
      month: {
        gte: 1,
        lte: 12
      },
      NOT: {
        businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT
      }
    }
  });

  return { deletedRows: result.count };
}

export async function clearNumericAiForecastCacheForCompanies(input: {
  companyNames: string[];
  tx?: AiForecastCacheClient;
}) {
  const companyNames = [...new Set(input.companyNames.map(asString).filter(Boolean))];
  if (companyNames.length === 0) return { deletedRows: 0 };

  const client = input.tx ?? prisma;
  const result = await client.aiForecastCache.deleteMany({
    where: {
      companyName: {
        in: companyNames
      },
      month: {
        gte: 1,
        lte: 12
      },
      NOT: {
        businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT
      }
    }
  });

  return { deletedRows: result.count };
}
