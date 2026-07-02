import { RedashSyncLock } from "@prisma/client";
import { config } from "../lib/config";
import { prisma } from "../lib/db";

const SYNC_LOCK_KEY = "redash-sync-global";

export class SyncLockBusyError extends Error {
  constructor() {
    super("A Redash sync is already running");
    this.name = "SyncLockBusyError";
  }
}

async function acquireSyncLock(owner: string): Promise<RedashSyncLock | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.SYNC_LOCK_TTL_SECONDS * 1000);

  const rows = await prisma.$queryRaw<RedashSyncLock[]>`
    INSERT INTO "RedashSyncLock" ("key", "owner", "acquiredAt", "expiresAt", "updatedAt")
    VALUES (${SYNC_LOCK_KEY}, ${owner}, ${now}, ${expiresAt}, ${now})
    ON CONFLICT ("key") DO UPDATE
    SET
      "owner" = EXCLUDED."owner",
      "acquiredAt" = EXCLUDED."acquiredAt",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "RedashSyncLock"."expiresAt" <= ${now}
    RETURNING *
  `;

  return rows[0] ?? null;
}

async function releaseSyncLock(owner: string) {
  await prisma.redashSyncLock.deleteMany({
    where: {
      key: SYNC_LOCK_KEY,
      owner
    }
  });
}

export async function runWithSyncLock<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const lock = await acquireSyncLock(owner);

  if (!lock) {
    throw new SyncLockBusyError();
  }

  try {
    return await action();
  } finally {
    await releaseSyncLock(owner);
  }
}
