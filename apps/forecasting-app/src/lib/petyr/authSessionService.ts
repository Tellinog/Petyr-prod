import {
  createPetyrLocalSessionId,
  isPetyrServerSessionExpired,
  shouldRefreshPetyrAccessToken,
  toPetyrServerAuthSession,
  type AccessLayerAuthResponse,
  type PetyrAuthConfig,
  type PetyrAuthIdentity,
  type PetyrServerAuthSession
} from "./authCore";
import {
  logoutAccessLayerSession,
  refreshAccessLayerSession
} from "./accessLayerClient";

export type PetyrLockedAuthSession = {
  session: PetyrServerAuthSession | null;
  replace(session: PetyrServerAuthSession): Promise<void>;
  delete(): Promise<void>;
};

export interface PetyrAuthSessionStore {
  create(localSessionId: string, session: PetyrServerAuthSession, encryptionSecret: string): Promise<void>;
  get(localSessionId: string, encryptionSecret: string): Promise<PetyrServerAuthSession | null>;
  delete(localSessionId: string): Promise<void>;
  withRefreshLock<T>(
    localSessionId: string,
    encryptionSecret: string,
    operation: (locked: PetyrLockedAuthSession) => Promise<T>
  ): Promise<T>;
}

export type PetyrAuthSessionServiceDependencies = {
  store: PetyrAuthSessionStore;
  now?: () => number;
  localSessionIdFactory?: () => string;
  refresh?: typeof refreshAccessLayerSession;
  logout?: typeof logoutAccessLayerSession;
};

export type PetyrAuthSessionResolution =
  | {
      ok: true;
      identity: PetyrAuthIdentity;
    }
  | {
      ok: false;
      reason: "missing" | "expired" | "refresh_failed" | "store_unavailable";
      clearSessionCookie: boolean;
    };

export async function createPetyrAuthSessionFromExchange(
  exchanged: AccessLayerAuthResponse,
  config: PetyrAuthConfig,
  dependencies: PetyrAuthSessionServiceDependencies
) {
  const nowMs = (dependencies.now ?? Date.now)();
  const localSessionId = (dependencies.localSessionIdFactory ?? createPetyrLocalSessionId)();
  const session = toPetyrServerAuthSession(exchanged, nowMs);

  try {
    await dependencies.store.create(localSessionId, session, config.sessionSecret ?? "");
  } catch {
    try {
      await (dependencies.logout ?? logoutAccessLayerSession)(
        config,
        session.identity.accessSessionId,
        session.refreshToken
      );
    } catch {
      // The callback still fails closed if remote cleanup is temporarily unavailable.
    }
    throw new Error("Unable to create the local Petyr authentication session.");
  }

  return {
    localSessionId,
    identity: session.identity
  };
}

export async function resolvePetyrAuthSession(
  localSessionId: string | undefined,
  config: PetyrAuthConfig,
  dependencies: PetyrAuthSessionServiceDependencies
): Promise<PetyrAuthSessionResolution> {
  if (!localSessionId) {
    return { ok: false, reason: "missing", clearSessionCookie: false };
  }

  const encryptionSecret = config.sessionSecret ?? "";
  let session: PetyrServerAuthSession | null;
  try {
    session = await dependencies.store.get(localSessionId, encryptionSecret);
  } catch {
    return { ok: false, reason: "store_unavailable", clearSessionCookie: false };
  }

  if (!session) {
    return { ok: false, reason: "missing", clearSessionCookie: true };
  }

  const now = dependencies.now ?? Date.now;
  if (isPetyrServerSessionExpired(session.accessLayerSessionExpiresAt, now())) {
    try {
      await dependencies.store.delete(localSessionId);
    } catch {
      return { ok: false, reason: "store_unavailable", clearSessionCookie: false };
    }
    return { ok: false, reason: "expired", clearSessionCookie: true };
  }

  if (!shouldRefreshPetyrAccessToken(session.accessTokenExpiresAt, now())) {
    return { ok: true, identity: session.identity };
  }

  try {
    return await dependencies.store.withRefreshLock(
      localSessionId,
      encryptionSecret,
      async (locked): Promise<PetyrAuthSessionResolution> => {
        const current = locked.session;
        if (!current) {
          return { ok: false, reason: "missing", clearSessionCookie: true };
        }

        if (isPetyrServerSessionExpired(current.accessLayerSessionExpiresAt, now())) {
          await locked.delete();
          return { ok: false, reason: "expired", clearSessionCookie: true };
        }

        if (!shouldRefreshPetyrAccessToken(current.accessTokenExpiresAt, now())) {
          return { ok: true, identity: current.identity };
        }

        try {
          const refreshed = await (dependencies.refresh ?? refreshAccessLayerSession)(
            config,
            current.refreshToken
          );
          const replacement = toPetyrServerAuthSession(refreshed, now());
          await locked.replace(replacement);
          return { ok: true, identity: replacement.identity };
        } catch {
          await locked.delete();
          return { ok: false, reason: "refresh_failed", clearSessionCookie: true };
        }
      }
    );
  } catch {
    try {
      await dependencies.store.delete(localSessionId);
    } catch {
      // The next request still fails closed even if the store is temporarily unavailable.
    }
    return { ok: false, reason: "refresh_failed", clearSessionCookie: true };
  }
}

export async function logoutPetyrAuthSession(
  localSessionId: string | undefined,
  config: PetyrAuthConfig,
  dependencies: PetyrAuthSessionServiceDependencies
) {
  if (!localSessionId) {
    return { remoteLogoutAttempted: false, remoteLogoutSucceeded: false };
  }

  let session: PetyrServerAuthSession | null = null;
  try {
    session = await dependencies.store.get(localSessionId, config.sessionSecret ?? "");
  } catch {
    // Local deletion below remains mandatory.
  }

  try {
    await dependencies.store.delete(localSessionId);
  } catch {
    // Remote revocation is still attempted below when the session was readable.
  }

  if (config.mode !== "access-layer" || !session) {
    return { remoteLogoutAttempted: false, remoteLogoutSucceeded: false };
  }

  try {
    await (dependencies.logout ?? logoutAccessLayerSession)(
      config,
      session.identity.accessSessionId,
      session.refreshToken
    );
    return { remoteLogoutAttempted: true, remoteLogoutSucceeded: true };
  } catch {
    return { remoteLogoutAttempted: true, remoteLogoutSucceeded: false };
  }
}
