import { Prisma, type PetyrAuthSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  hashPetyrLocalSessionId,
  openPetyrAuthToken,
  sealPetyrAuthToken,
  type PetyrServerAuthSession
} from "./authCore";
import type {
  PetyrAuthSessionStore,
  PetyrLockedAuthSession
} from "./authSessionService";

function toStoredSessionData(session: PetyrServerAuthSession, encryptionSecret: string) {
  return {
    accessTokenCiphertext: sealPetyrAuthToken(session.accessToken, encryptionSecret),
    refreshTokenCiphertext: sealPetyrAuthToken(session.refreshToken, encryptionSecret),
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    accessLayerSessionId: session.identity.accessSessionId,
    accessLayerSessionIssuedAt: session.accessLayerSessionIssuedAt,
    accessLayerSessionExpiresAt: session.accessLayerSessionExpiresAt,
    googleSub: session.identity.googleSub,
    email: session.identity.email,
    displayName: session.identity.user.displayName,
    role: session.identity.role,
    permissions: [...session.identity.permissions] as Prisma.InputJsonValue,
    correlationId: session.identity.correlationId
  };
}

function fromStoredSession(
  row: PetyrAuthSession,
  encryptionSecret: string
): PetyrServerAuthSession | null {
  const accessToken = openPetyrAuthToken(row.accessTokenCiphertext, encryptionSecret);
  const refreshToken = openPetyrAuthToken(row.refreshTokenCiphertext, encryptionSecret);
  const permissions = row.permissions;
  const normalizedPermissions = Array.isArray(permissions)
    ? permissions.filter(
        (permission): permission is string =>
          typeof permission === "string" && permission.length > 0
      )
    : [];

  if (
    !accessToken ||
    !refreshToken ||
    !Array.isArray(permissions) ||
    normalizedPermissions.length !== permissions.length
  ) {
    return null;
  }

  return {
    identity: {
      user: {
        email: row.email,
        displayName: row.displayName
      },
      googleSub: row.googleSub,
      email: row.email,
      permissions: normalizedPermissions,
      role: row.role,
      accessSessionId: row.accessLayerSessionId,
      correlationId: row.correlationId
    },
    accessToken,
    refreshToken,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    accessLayerSessionIssuedAt: row.accessLayerSessionIssuedAt,
    accessLayerSessionExpiresAt: row.accessLayerSessionExpiresAt
  };
}

function getAdvisoryLockKey(idHash: string) {
  return Buffer.from(idHash.slice(0, 16), "hex").readBigInt64BE(0);
}

export const prismaPetyrAuthSessionStore: PetyrAuthSessionStore = {
  async create(localSessionId, session, encryptionSecret) {
    await prisma.petyrAuthSession.create({
      data: {
        idHash: hashPetyrLocalSessionId(localSessionId),
        ...toStoredSessionData(session, encryptionSecret)
      }
    });
  },

  async get(localSessionId, encryptionSecret) {
    const idHash = hashPetyrLocalSessionId(localSessionId);
    const row = await prisma.petyrAuthSession.findUnique({ where: { idHash } });
    if (!row) return null;

    const session = fromStoredSession(row, encryptionSecret);
    if (!session) {
      await prisma.petyrAuthSession.deleteMany({ where: { idHash } });
    }
    return session;
  },

  async delete(localSessionId) {
    await prisma.petyrAuthSession.deleteMany({
      where: { idHash: hashPetyrLocalSessionId(localSessionId) }
    });
  },

  async withRefreshLock<T>(
    localSessionId: string,
    encryptionSecret: string,
    operation: (locked: PetyrLockedAuthSession) => Promise<T>
  ) {
    const idHash = hashPetyrLocalSessionId(localSessionId);
    const advisoryLockKey = getAdvisoryLockKey(idHash);

    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockKey})`;

        const row = await transaction.petyrAuthSession.findUnique({ where: { idHash } });
        const session = row ? fromStoredSession(row, encryptionSecret) : null;

        if (row && !session) {
          await transaction.petyrAuthSession.deleteMany({ where: { idHash } });
        }

        return operation({
          session,
          async replace(replacement) {
            await transaction.petyrAuthSession.update({
              where: { idHash },
              data: toStoredSessionData(replacement, encryptionSecret)
            });
          },
          async delete() {
            await transaction.petyrAuthSession.deleteMany({ where: { idHash } });
          }
        });
      },
      {
        maxWait: 10_000,
        timeout: 30_000
      }
    );
  }
};
