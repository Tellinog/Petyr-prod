import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rawLatestTables = [
  "redash_raw_master_campaigns_latest",
  "redash_raw_master_agreements_latest",
  "redash_raw_company_ownership_latest"
];

const managedSchema = "public";
const holdSchema = "prisma_hold";

function quoteIdentifier(identifier: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function holdTableName(tableName: string) {
  return `__prisma_hold_${tableName}`;
}

async function ensureHoldSchema() {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(holdSchema)}`);
}

async function tableExists(schemaName: string, tableName: string) {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass(${`${schemaName}.${tableName}`}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function renameTable(schemaName: string, from: string, to: string) {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(from)} RENAME TO ${quoteIdentifier(to)}`
  );
}

async function moveTableToSchema(tableName: string, fromSchema: string, toSchema: string) {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${quoteIdentifier(fromSchema)}.${quoteIdentifier(tableName)} SET SCHEMA ${quoteIdentifier(toSchema)}`
  );
}

function runPrismaDbPush() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, ["prisma", "db", "push"], {
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma db push exited with code ${code}`));
    });
  });
}

async function main() {
  const heldTables: string[] = [];

  try {
    await ensureHoldSchema();

    for (const tableName of rawLatestTables) {
      const legacyTemporaryName = holdTableName(tableName);
      const legacyTempExists = await tableExists(managedSchema, legacyTemporaryName);
      const tableIsPresent = await tableExists(managedSchema, tableName);
      const tableAlreadyHeld = await tableExists(holdSchema, tableName);

      if (legacyTempExists && tableIsPresent) {
        throw new Error(`Both ${tableName} and ${legacyTemporaryName} exist. Refusing to run db push.`);
      }

      if (legacyTempExists && !tableIsPresent) {
        await renameTable(managedSchema, legacyTemporaryName, tableName);
      }

      if (tableAlreadyHeld && (await tableExists(managedSchema, tableName))) {
        throw new Error(`Both ${managedSchema}.${tableName} and ${holdSchema}.${tableName} exist.`);
      }

      if (tableAlreadyHeld && !(await tableExists(managedSchema, tableName))) {
        await moveTableToSchema(tableName, holdSchema, managedSchema);
      }

      if (await tableExists(managedSchema, tableName)) {
        await moveTableToSchema(tableName, managedSchema, holdSchema);
        heldTables.push(tableName);
      }
    }

    await runPrismaDbPush();
  } finally {
    for (const tableName of heldTables.reverse()) {
      if (await tableExists(holdSchema, tableName)) {
        if (await tableExists(managedSchema, tableName)) {
          throw new Error(`Cannot restore ${tableName}; a table with that name already exists.`);
        }

        await moveTableToSchema(tableName, holdSchema, managedSchema);
      }
    }

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
