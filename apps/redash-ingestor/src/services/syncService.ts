import crypto from "node:crypto";
import { Prisma, RedashSource } from "@prisma/client";
import { prisma } from "../lib/db";
import { executeRedashQuery } from "../lib/redashClient";
import { logger } from "../lib/logger";
import { startPerformanceTimer } from "../lib/performance";
import { materializeLatestRedashSnapshot } from "./redashRawMaterializer";

function hashPayload(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function syncSource(source: RedashSource, triggeredBy = "worker") {
  const run = await prisma.redashSyncRun.create({
    data: {
      sourceId: source.id,
      status: "RUNNING",
      triggeredBy
    }
  });

  logger.info("Sync started", {
    sourceKey: source.key,
    runId: run.id,
    redashQueryId: source.redashQueryId
  });

  let syncStatus = "FAILED";
  let rowsCount = 0;
  const finishPerformance = startPerformanceTimer("Redash sync execution", {
    sourceKey: source.key,
    runId: run.id,
    triggeredBy
  });

  try {
    const result = await executeRedashQuery({
      queryId: source.redashQueryId,
      parameters: asRecord(source.parameters),
      maxAgeSeconds: source.maxAgeSeconds,
      apiKey: source.apiKey
    });

    rowsCount = result.rowsCount;
    const payloadHash = hashPayload(result.payload);

    const snapshot = await prisma.redashSnapshot.create({
      data: {
        sourceId: source.id,
        runId: run.id,
        payload: result.payload as Prisma.InputJsonValue,
        payloadHash,
        rowsCount: result.rowsCount,
        queryResultId: result.queryResultId
      }
    });

    await materializeLatestRedashSnapshot({
      sourceKey: source.key,
      snapshotId: snapshot.id,
      syncedAt: snapshot.fetchedAt,
      payload: result.payload
    });

    const updatedRun = await prisma.redashSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        rowsCount: result.rowsCount,
        queryResultId: result.queryResultId
      }
    });

    syncStatus = "SUCCESS";

    logger.info("Sync completed", {
      sourceKey: source.key,
      runId: run.id,
      rowsCount: result.rowsCount,
      queryResultId: result.queryResultId
    });

    return updatedRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const failedRun = await prisma.redashSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: message
      }
    });

    logger.error("Sync failed", {
      sourceKey: source.key,
      runId: run.id,
      error: message
    });

    return failedRun;
  } finally {
    finishPerformance({
      status: syncStatus,
      rowsCount
    });
  }
}

export async function syncSourceByKey(sourceKey: string, triggeredBy = "api") {
  const source = await prisma.redashSource.findUnique({
    where: { key: sourceKey }
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceKey}`);
  }

  if (!source.enabled) {
    throw new Error(`Source is disabled: ${sourceKey}`);
  }

  return syncSource(source, triggeredBy);
}

export async function syncAllEnabledSources(triggeredBy = "worker") {
  const sources = await prisma.redashSource.findMany({
    where: { enabled: true },
    orderBy: { key: "asc" }
  });

  const results = [];

  for (const source of sources) {
    const result = await syncSource(source, triggeredBy);
    results.push(result);
  }

  return results;
}
