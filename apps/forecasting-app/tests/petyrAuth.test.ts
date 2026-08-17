import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ALL_PETYR_PERMISSIONS,
  PETYR_AUTH_REFRESH_THRESHOLD_MS,
  PETYR_PERMISSIONS,
  canManagePetyrFeedback,
  canRefreshPetyrSourceData,
  createAuthState,
  createPetyrLocalSessionId,
  getAccessLayerStartUrl,
  getLocalDevelopmentIdentity,
  getPetyrDefaultLandingPath,
  getPetyrPublicRedirectUrl,
  hasPetyrPermission,
  hasUsablePetyrGrant,
  hashPetyrLocalSessionId,
  isValidAuthCallbackState,
  joinAccessLayerUrl,
  openPetyrAuthToken,
  parseAccessLayerAuthResponse,
  readPetyrAuthConfig,
  sealPetyrAuthToken,
  shouldRefreshPetyrAccessToken,
  toAccessLayerIdentity,
  toPetyrServerAuthSession,
  type AccessLayerAuthResponse,
  type PetyrAuthConfig,
  type PetyrServerAuthSession
} from "../src/lib/petyr/authCore";
import {
  PetyrAccessLayerRequestError,
  logoutAccessLayerSession,
  refreshAccessLayerSession
} from "../src/lib/petyr/accessLayerClient";
import {
  createPetyrAuthSessionFromExchange,
  logoutPetyrAuthSession,
  resolvePetyrAuthSession,
  type PetyrAuthSessionStore,
  type PetyrLockedAuthSession
} from "../src/lib/petyr/authSessionService";
import { normalizePetyrCsmIdentityName, resolvePreferredCsmName } from "../src/lib/petyr/csmIdentity";

const NOW_MS = Date.parse("2026-07-24T12:00:00.000Z");
const SESSION_SECRET = "local-test-session-secret-with-enough-entropy";
const LOCAL_SESSION_ID = "pts_local_test_session";

function accessLayerConfig(overrides: Partial<PetyrAuthConfig> = {}): PetyrAuthConfig {
  return {
    mode: "access-layer",
    publicBaseUrl: "https://public.example/access-control",
    internalBaseUrl: "http://access-layer:8080/access-control",
    callbackUrl: "https://petyr.example/auth/callback",
    toolSlug: "petyr",
    clientId: "tlc_petyr",
    clientSecret: "tls_petyr_secret",
    sessionSecret: SESSION_SECRET,
    ...overrides
  };
}

function accessLayerPayload(
  overrides: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    sessionId?: string;
    sessionIssuedAt?: string;
    sessionExpiresAt?: string;
    permissions?: string[];
    role?: string;
    displayName?: string | null;
    correlationId?: string;
  } = {}
): AccessLayerAuthResponse {
  return {
    access_token: overrides.accessToken ?? "access_token_current",
    token_type: "Bearer",
    expires_in: overrides.expiresIn ?? 900,
    refresh_token: overrides.refreshToken ?? "refresh_token_current",
    session: {
      id: overrides.sessionId ?? "als_123",
      issued_at: overrides.sessionIssuedAt ?? "2026-07-24T12:00:00.000Z",
      expires_at: overrides.sessionExpiresAt ?? "2026-07-24T20:00:00.000Z"
    },
    user: {
      id: "usr_123",
      google_sub: "google-sub-123",
      email: "mario.rossi@unguess.io",
      email_verified: true,
      hd: "unguess.io",
      display_name: overrides.displayName === undefined ? "Mario Rossi" : overrides.displayName
    },
    tool: {
      slug: "petyr",
      display_name: "Petyr"
    },
    grant: {
      role: overrides.role ?? "petyr_csm",
      permissions: overrides.permissions ?? [PETYR_PERMISSIONS.read, PETYR_PERMISSIONS.forecastWrite]
    },
    correlation_id: overrides.correlationId ?? "corr_123"
  };
}

function cloneSession(session: PetyrServerAuthSession): PetyrServerAuthSession {
  return {
    ...session,
    identity: {
      ...session.identity,
      user: { ...session.identity.user },
      permissions: [...session.identity.permissions]
    },
    accessTokenExpiresAt: new Date(session.accessTokenExpiresAt),
    accessLayerSessionIssuedAt: new Date(session.accessLayerSessionIssuedAt),
    accessLayerSessionExpiresAt: new Date(session.accessLayerSessionExpiresAt)
  };
}

class MemoryAuthSessionStore implements PetyrAuthSessionStore {
  private readonly sessions = new Map<string, PetyrServerAuthSession>();
  private readonly lockTails = new Map<string, Promise<void>>();
  lastCreatedLocalSessionId: string | null = null;

  async create(
    localSessionId: string,
    session: PetyrServerAuthSession,
    _encryptionSecret: string
  ) {
    this.lastCreatedLocalSessionId = localSessionId;
    this.sessions.set(localSessionId, cloneSession(session));
  }

  async get(localSessionId: string, _encryptionSecret: string) {
    const session = this.sessions.get(localSessionId);
    return session ? cloneSession(session) : null;
  }

  async delete(localSessionId: string) {
    this.sessions.delete(localSessionId);
  }

  async withRefreshLock<T>(
    localSessionId: string,
    _encryptionSecret: string,
    operation: (locked: PetyrLockedAuthSession) => Promise<T>
  ) {
    const previous = this.lockTails.get(localSessionId) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentTail = previous.then(() => gate);
    this.lockTails.set(localSessionId, currentTail);
    await previous;

    try {
      const session = this.sessions.get(localSessionId);
      return await operation({
        session: session ? cloneSession(session) : null,
        replace: async (replacement) => {
          this.sessions.set(localSessionId, cloneSession(replacement));
        },
        delete: async () => {
          this.sessions.delete(localSessionId);
        }
      });
    } finally {
      release();
      if (this.lockTails.get(localSessionId) === currentTail) {
        this.lockTails.delete(localSessionId);
      }
    }
  }
}

async function seedSession(
  store: MemoryAuthSessionStore,
  payload = accessLayerPayload(),
  localSessionId = LOCAL_SESSION_ID
) {
  await store.create(localSessionId, toPetyrServerAuthSession(payload, NOW_MS), SESSION_SECRET);
}

test("auth disabled returns deterministic local development identity", () => {
  const config = readPetyrAuthConfig({ NODE_ENV: "development" });
  const identity = getLocalDevelopmentIdentity();

  assert.equal(config.mode, "disabled");
  assert.equal(identity.email, "dev.petyr@local");
  assert.equal(identity.role, "local_developer");
  assert.deepEqual(identity.permissions, ALL_PETYR_PERMISSIONS);
});

test("production defaults to Access Layer and fails closed when config is missing", () => {
  assert.throws(
    () => readPetyrAuthConfig({ NODE_ENV: "production" }),
    /missing configuration: ACCESS_LAYER_PUBLIC_BASE_URL/
  );

  assert.throws(
    () => readPetyrAuthConfig({ NODE_ENV: "production", PETYR_AUTH_MODE: "disabled" }),
    /disabled is not allowed/
  );
});

test("access-layer mode reads required URLs and tool credentials", () => {
  const config = readPetyrAuthConfig({
    NODE_ENV: "production",
    PETYR_AUTH_MODE: "access-layer",
    ACCESS_LAYER_PUBLIC_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_INTERNAL_BASE_URL: "http://access-layer:8080/access-control",
    ACCESS_LAYER_CALLBACK_URL: "https://petyr.unguess-internal.net/auth/callback",
    ACCESS_LAYER_TOOL_SLUG: "petyr",
    ACCESS_LAYER_CLIENT_ID: "tlc_petyr",
    ACCESS_LAYER_CLIENT_SECRET: "tls_petyr",
    PETYR_SESSION_SECRET: SESSION_SECRET
  });

  assert.equal(config.mode, "access-layer");
  assert.equal(config.publicBaseUrl, "https://access-layer.draftapps.it");
  assert.equal(config.internalBaseUrl, "http://access-layer:8080/access-control");
  assert.equal(config.callbackUrl, "https://petyr.unguess-internal.net/auth/callback");
  assert.equal(config.toolSlug, "petyr");
});

test("public Petyr redirects use callback origin instead of internal request origin", () => {
  const redirectUrl = getPetyrPublicRedirectUrl(
    "/forecasting",
    "http://0.0.0.0:3000/auth/callback?code=abc",
    accessLayerConfig()
  );

  assert.equal(redirectUrl.toString(), "https://petyr.example/forecasting");
});

test("public login and internal API URLs stay separated and preserve configured base paths", async () => {
  const config = accessLayerConfig();
  const startUrl = getAccessLayerStartUrl(config, "state_123");
  assert.equal(startUrl.origin, "https://public.example");
  assert.equal(startUrl.pathname, "/access-control/v1/auth/start");
  assert.equal(
    joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/introspect"),
    "http://access-layer:8080/access-control/v1/auth/introspect"
  );

  let requestedUrl = "";
  const fetchImpl = (async (input: URL | RequestInfo) => {
    requestedUrl = String(input);
    return Response.json(accessLayerPayload({ refreshToken: "refresh_token_rotated" }));
  }) as typeof fetch;

  await refreshAccessLayerSession(config, "refresh_token_current", { fetchImpl });
  assert.equal(
    requestedUrl,
    "http://access-layer:8080/access-control/v1/auth/refresh"
  );
});

test("callback state is random enough for local validation", () => {
  const first = createAuthState();
  const second = createAuthState();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length >= 24);
});

test("callback state validation rejects missing or mismatched values", () => {
  assert.equal(isValidAuthCallbackState("state_a", "state_a"), true);
  assert.equal(isValidAuthCallbackState(null, "state_a"), false);
  assert.equal(isValidAuthCallbackState("state_a", undefined), false);
  assert.equal(isValidAuthCallbackState("state_a", "state_b"), false);
});

test("local session cookies are opaque and server-side tokens are encrypted at rest", () => {
  const localSessionId = createPetyrLocalSessionId();
  const accessToken = "access_token_never_in_browser";
  const sealed = sealPetyrAuthToken(accessToken, SESSION_SECRET);

  assert.match(localSessionId, /^pts_[A-Za-z0-9_-]+$/);
  assert.equal(localSessionId.includes(accessToken), false);
  assert.equal(hashPetyrLocalSessionId(localSessionId).length, 64);
  assert.equal(sealed.includes(accessToken), false);
  assert.equal(openPetyrAuthToken(sealed, SESSION_SECRET), accessToken);
  assert.equal(openPetyrAuthToken(sealed, "wrong-secret"), null);
});

test("Access Layer payload validation requires refresh/session expiries and the expected tool", () => {
  assert.deepEqual(
    parseAccessLayerAuthResponse(accessLayerPayload(), "petyr"),
    accessLayerPayload()
  );
  assert.throws(
    () =>
      parseAccessLayerAuthResponse(
        { ...accessLayerPayload(), refresh_token: undefined },
        "petyr"
      ),
    /Malformed/
  );
  assert.throws(
    () =>
      parseAccessLayerAuthResponse(
        { ...accessLayerPayload(), tool: { slug: "other-tool" } },
        "petyr"
      ),
    /Malformed/
  );
});

test("callback session creation keeps refresh token and expiries only in the server-side store", async () => {
  const store = new MemoryAuthSessionStore();
  const exchanged = accessLayerPayload({
    accessToken: "callback_access_token",
    refreshToken: "callback_refresh_token"
  });
  const created = await createPetyrAuthSessionFromExchange(exchanged, accessLayerConfig(), {
    store,
    now: () => NOW_MS,
    localSessionIdFactory: () => LOCAL_SESSION_ID
  });
  const stored = await store.get(LOCAL_SESSION_ID, SESSION_SECRET);

  assert.equal(created.localSessionId, LOCAL_SESSION_ID);
  assert.equal(store.lastCreatedLocalSessionId, LOCAL_SESSION_ID);
  assert.equal(stored?.accessToken, "callback_access_token");
  assert.equal(stored?.refreshToken, "callback_refresh_token");
  assert.equal(stored?.accessTokenExpiresAt.toISOString(), "2026-07-24T12:15:00.000Z");
  assert.equal(stored?.accessLayerSessionExpiresAt.toISOString(), "2026-07-24T20:00:00.000Z");
  assert.equal(JSON.stringify(created).includes("callback_access_token"), false);
  assert.equal(JSON.stringify(created).includes("callback_refresh_token"), false);
});

test("Access Layer exchange payload maps to the existing Petyr identity and permissions", () => {
  const identity = toAccessLayerIdentity(accessLayerPayload());

  assert.equal(identity.googleSub, "google-sub-123");
  assert.equal(identity.email, "mario.rossi@unguess.io");
  assert.equal(identity.accessSessionId, "als_123");
  assert.equal(identity.correlationId, "corr_123");
  assert.equal(hasPetyrPermission(identity, PETYR_PERMISSIONS.read), true);
  assert.equal(hasPetyrPermission(identity, PETYR_PERMISSIONS.admin), false);
  assert.equal(hasUsablePetyrGrant(identity), true);
});

test("a request with more than 60 seconds remaining does not refresh", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(store, accessLayerPayload({ expiresIn: 61 }));
  let refreshCalls = 0;

  const resolved = await resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    now: () => NOW_MS,
    refresh: async () => {
      refreshCalls += 1;
      return accessLayerPayload();
    }
  });

  assert.equal(resolved.ok, true);
  assert.equal(refreshCalls, 0);
});

test("a request at the 60-second threshold refreshes and continues with updated identity", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(store, accessLayerPayload({ expiresIn: 60 }));
  let refreshCalls = 0;

  const resolved = await resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    now: () => NOW_MS,
    refresh: async () => {
      refreshCalls += 1;
      return accessLayerPayload({
        accessToken: "access_token_new",
        refreshToken: "refresh_token_new",
        permissions: [PETYR_PERMISSIONS.admin],
        role: "petyr_admin",
        correlationId: "corr_new"
      });
    }
  });

  assert.equal(resolved.ok, true);
  assert.equal(refreshCalls, 1);
  if (resolved.ok) {
    assert.deepEqual(resolved.identity.permissions, [PETYR_PERMISSIONS.admin]);
    assert.equal(resolved.identity.role, "petyr_admin");
    assert.equal(resolved.identity.correlationId, "corr_new");
  }
});

test("refresh token rotation atomically replaces the previous token", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(
    store,
    accessLayerPayload({ expiresIn: 30, refreshToken: "refresh_token_single_use_old" })
  );

  await resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    now: () => NOW_MS,
    refresh: async (_config, presentedRefreshToken) => {
      assert.equal(presentedRefreshToken, "refresh_token_single_use_old");
      return accessLayerPayload({
        accessToken: "access_token_rotated",
        refreshToken: "refresh_token_single_use_new",
        sessionExpiresAt: "2026-07-25T04:00:00.000Z"
      });
    }
  });

  const stored = await store.get(LOCAL_SESSION_ID, SESSION_SECRET);
  assert.equal(stored?.accessToken, "access_token_rotated");
  assert.equal(stored?.refreshToken, "refresh_token_single_use_new");
  assert.notEqual(stored?.refreshToken, "refresh_token_single_use_old");
  assert.equal(stored?.accessLayerSessionExpiresAt.toISOString(), "2026-07-25T04:00:00.000Z");
});

test("two concurrent authenticated requests produce one refresh call", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(store, accessLayerPayload({ expiresIn: 10 }));
  let refreshCalls = 0;

  const dependencies = {
    store,
    now: () => NOW_MS,
    refresh: async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return accessLayerPayload({
        accessToken: "access_token_after_concurrent_refresh",
        refreshToken: "refresh_token_after_concurrent_refresh"
      });
    }
  };

  const [first, second] = await Promise.all([
    resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), dependencies),
    resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), dependencies)
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(refreshCalls, 1);
});

test("AUTH_REFRESH_TOKEN_INVALID clears the local session and does not retry", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(store, accessLayerPayload({ expiresIn: 10 }));
  let refreshCalls = 0;

  const resolved = await resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    now: () => NOW_MS,
    refresh: async () => {
      refreshCalls += 1;
      throw new PetyrAccessLayerRequestError("invalid_refresh");
    }
  });

  assert.deepEqual(resolved, {
    ok: false,
    reason: "refresh_failed",
    clearSessionCookie: true
  });
  assert.equal(refreshCalls, 1);
  assert.equal(await store.get(LOCAL_SESSION_ID, SESSION_SECRET), null);
});

test("malformed refresh responses also clear the local session", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(store, accessLayerPayload({ expiresIn: 10 }));

  const resolved = await resolvePetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    now: () => NOW_MS,
    refresh: async () => ({}) as AccessLayerAuthResponse
  });

  assert.equal(resolved.ok, false);
  assert.equal(await store.get(LOCAL_SESSION_ID, SESSION_SECRET), null);
});

test("auth refresh is request-driven and defines no interval, cron, or heartbeat", () => {
  const sources = [
    readFileSync("src/lib/petyr/auth.ts", "utf8"),
    readFileSync("src/lib/petyr/authSessionService.ts", "utf8"),
    readFileSync("src/lib/petyr/accessLayerClient.ts", "utf8")
  ].join("\n");

  assert.doesNotMatch(sources, /\bsetInterval\s*\(/);
  assert.doesNotMatch(sources, /\bcron\b/i);
  assert.doesNotMatch(sources, /\bheartbeat\b/i);
});

test("logout sends the latest session ID and refresh token and always clears local state", async () => {
  const store = new MemoryAuthSessionStore();
  await seedSession(
    store,
    accessLayerPayload({
      sessionId: "als_logout",
      refreshToken: "refresh_token_latest"
    })
  );
  let logoutInput: { sessionId: string | null; refreshToken: string | null } | null = null;

  const result = await logoutPetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    logout: async (_config, sessionId, refreshToken) => {
      logoutInput = { sessionId, refreshToken };
    }
  });

  assert.deepEqual(logoutInput, {
    sessionId: "als_logout",
    refreshToken: "refresh_token_latest"
  });
  assert.deepEqual(result, {
    remoteLogoutAttempted: true,
    remoteLogoutSucceeded: true
  });
  assert.equal(await store.get(LOCAL_SESSION_ID, SESSION_SECRET), null);

  await seedSession(store);
  const failedRemote = await logoutPetyrAuthSession(LOCAL_SESSION_ID, accessLayerConfig(), {
    store,
    logout: async () => {
      throw new Error("remote unavailable");
    }
  });
  assert.equal(failedRemote.remoteLogoutSucceeded, false);
  assert.equal(await store.get(LOCAL_SESSION_ID, SESSION_SECRET), null);
});

test("logout client body includes both revocation handles without exposing them in output", async () => {
  let requestBody = "";
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  await logoutAccessLayerSession(
    accessLayerConfig(),
    "als_logout_body",
    "refresh_token_logout_body",
    { fetchImpl }
  );

  assert.deepEqual(JSON.parse(requestBody), {
    session_id: "als_logout_body",
    refresh_token: "refresh_token_logout_body"
  });
});

test("Access Layer failures never copy tokens or client secrets into surfaced errors", async () => {
  const token = "refresh_token_do_not_expose";
  const secret = accessLayerConfig().clientSecret ?? "";
  const fetchImpl = (async () =>
    Response.json(
      {
        error: {
          code: "AUTH_REFRESH_TOKEN_INVALID",
          message: `invalid ${token} ${secret}`,
          correlation_id: "corr_failure"
        }
      },
      { status: 401 }
    )) as typeof fetch;

  let surfaced = "";
  try {
    await refreshAccessLayerSession(accessLayerConfig(), token, { fetchImpl });
  } catch (error) {
    surfaced = JSON.stringify({
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Authentication failed",
      kind: error instanceof PetyrAccessLayerRequestError ? error.kind : "unknown"
    });
  }

  assert.equal(surfaced.includes(token), false);
  assert.equal(surfaced.includes(secret), false);
  assert.doesNotMatch(
    readFileSync("src/lib/petyr/accessLayerClient.ts", "utf8"),
    /console\.(log|error|warn|info)/
  );
});

test("Access Layer exchange payload without Petyr read permission is not a usable grant", () => {
  const identity = toAccessLayerIdentity(
    accessLayerPayload({ permissions: [], role: "pending" })
  );
  assert.equal(hasUsablePetyrGrant(identity), false);
});

test("feedback manager grant is usable without Petyr read and lands in feedback review", () => {
  const identity = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.feedbackManage]
  };

  assert.equal(hasUsablePetyrGrant(identity), true);
  assert.equal(canManagePetyrFeedback(identity), true);
  assert.equal(hasPetyrPermission(identity, PETYR_PERMISSIONS.admin), false);
  assert.equal(getPetyrDefaultLandingPath(identity), "/petyr-admin/feedback");
});

test("admin retains feedback management access", () => {
  const identity = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.admin]
  };

  assert.equal(canManagePetyrFeedback(identity), true);
});

test("any Petyr permission can refresh Petyr source data", () => {
  const csm = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.read, PETYR_PERMISSIONS.forecastWrite]
  };
  const readOnly = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.read]
  };
  const admin = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.admin]
  };
  const feedbackManager = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.feedbackManage]
  };
  const managementWriter = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.managementWrite]
  };
  const redashOperator = {
    ...getLocalDevelopmentIdentity(),
    permissions: [PETYR_PERMISSIONS.redashOperator]
  };
  const noPermissions = {
    ...getLocalDevelopmentIdentity(),
    permissions: []
  };

  assert.equal(canRefreshPetyrSourceData(csm), true);
  assert.equal(canRefreshPetyrSourceData(readOnly), true);
  assert.equal(canRefreshPetyrSourceData(admin), true);
  assert.equal(canRefreshPetyrSourceData(feedbackManager), true);
  assert.equal(canRefreshPetyrSourceData(managementWriter), true);
  assert.equal(canRefreshPetyrSourceData(redashOperator), true);
  assert.equal(canRefreshPetyrSourceData(noPermissions), false);
});

test("refresh threshold remains exactly 60 seconds", () => {
  assert.equal(PETYR_AUTH_REFRESH_THRESHOLD_MS, 60_000);
  assert.equal(
    shouldRefreshPetyrAccessToken(new Date(NOW_MS + 60_001), NOW_MS),
    false
  );
  assert.equal(
    shouldRefreshPetyrAccessToken(new Date(NOW_MS + 60_000), NOW_MS),
    true
  );
});

test("CSM identity matching resolves exact names case-insensitively", () => {
  assert.equal(resolvePreferredCsmName("Mario Rossi", ["mario rossi", "Giulia Bianchi"]), "mario rossi");
});

test("CSM identity matching ignores accents and repeated spaces", () => {
  assert.equal(normalizePetyrCsmIdentityName("  M\u00e0rio   R\u00f3ssi  "), "mario rossi");
  assert.equal(resolvePreferredCsmName("  M\u00e0rio   R\u00f3ssi  ", ["Mario Rossi"]), "Mario Rossi");
});

test("CSM identity matching returns null when no candidate matches", () => {
  assert.equal(resolvePreferredCsmName("Mario Rossi", ["Giulia Bianchi"]), null);
});

test("CSM identity matching returns null when normalized candidates are ambiguous", () => {
  assert.equal(resolvePreferredCsmName("Mario Rossi", ["Mario Rossi", "M\u00e0rio Rossi"]), null);
});
