import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const requiredSources = [
  {
    key: "master_campaigns",
    name: "[Master] Campaigns",
    redashQueryId: 1465
  },
  {
    key: "master_agreements",
    name: "[Master] Agreements",
    redashQueryId: 1572
  },
  {
    key: "company_ownership",
    name: "[Master] Company Ownership",
    redashQueryId: 1685
  }
];

const legacySourcesToDisable = [
  "hubspot_deals",
  "agreements_campaigns_join",
  "agreements_warnings"
];

async function main() {
  const maxAgeSeconds = Number(process.env.SYNC_MAX_AGE_SECONDS ?? 0);

  for (const source of requiredSources) {
    await prisma.redashSource.upsert({
      where: { key: source.key },
      update: {
        name: source.name,
        redashQueryId: source.redashQueryId,
        maxAgeSeconds,
        enabled: true
      },
      create: {
        ...source,
        parameters: {},
        maxAgeSeconds,
        enabled: true
      }
    });
  }

  await prisma.redashSource.updateMany({
    where: {
      key: { in: legacySourcesToDisable }
    },
    data: {
      enabled: false
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed. Required sources enabled, legacy sources disabled.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
