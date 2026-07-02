import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const REDASH_INGESTOR_AUTH_SESSION_COOKIE = "redash_ingestor_auth_session";
export const REDASH_INGESTOR_AUTH_STATE_COOKIE = "redash_ingestor_auth_state";

export const REDASH_INGESTOR_PERMISSIONS = {
  read: "redash-ingestor:read",
  sync: "redash-ingestor:sync",
  sourcesWrite: "redash-ingestor:sources:write",
  admin: "redash-ingestor:admin"
} as const;

export const ALL_REDASH_INGESTOR_PERMISSIONS = Object.values(REDASH_INGESTOR_PERMISSIONS);

export type RedashIngestorPermission =
  (typeof REDASH_INGESTOR_PERMISSIONS)[keyof typeof REDASH_INGESTOR_PERMISSIONS];

export type RedashIngestorAuthMode = "disabled" | "access-layer";

export type RedashIngestorAuthConfig = {
  mode: RedashIngestorAuthMode;
  publicBaseUrl: string | null;
  internalBaseUrl: string | null;
  callbackUrl: string | null;
  toolSlug: string;
  clientId: string | null;
  clientSecret: string | null;
  sessionSecret: string | null;
};

export type RedashIngestorAuthIdentity = {
  user: {
    email: string;
    displayName: string | null;
  };
  googleSub: string;
  email: string;
  permissions: string[];
  role: string;
  accessSessionId: string;
  correlationId: string;
};

export type AccessLayerExchangeResponse = {
  session: {
    id: string;
  };
  user: {
    google_sub: string;
    email: string;
    display_name?: string | null;
  };
  grant: {
    role: string;
    permissions: string[];
  };
  correlation_id: string;
};

const DEV_IDENTITY: RedashIngestorAuthIdentity = {
  user: {
    email: "dev.redash-ingestor@local",
    displayName: "Local Redash Ingestor Operator"
  },
  googleSub: "local-dev-redash-ingestor",
  email: "dev.redash-ingestor@local",
  permissions: ALL_REDASH_INGESTOR_PERMISSIONS,
  role: "local_operator",
  accessSessionId: "local-redash-ingestor-session",
  correlationId: "local-redash-ingestor-correlation"
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readRedashIngestorAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): RedashIngestorAuthConfig {
  const explicitMode = clean(env.REDASH_INGESTOR_AUTH_MODE);
  const nodeEnv = clean(env.NODE_ENV) ?? "development";

  if (explicitMode && explicitMode !== "disabled" && explicitMode !== "access-layer") {
    throw new Error("REDASH_INGESTOR_AUTH_MODE must be either disabled or access-layer.");
  }

  if (nodeEnv === "production" && explicitMode === "disabled") {
    throw new Error("REDASH_INGESTOR_AUTH_MODE=disabled is not allowed when NODE_ENV=production.");
  }

  const mode: RedashIngestorAuthMode =
    explicitMode === "disabled" || explicitMode === "access-layer"
      ? explicitMode
      : nodeEnv === "development"
        ? "disabled"
        : "access-layer";

  const config: RedashIngestorAuthConfig = {
    mode,
    publicBaseUrl: clean(env.ACCESS_LAYER_PUBLIC_BASE_URL) ?? clean(env.ACCESS_LAYER_BASE_URL),
    internalBaseUrl: clean(env.ACCESS_LAYER_INTERNAL_BASE_URL) ?? clean(env.ACCESS_LAYER_BASE_URL),
    callbackUrl: clean(env.ACCESS_LAYER_CALLBACK_URL),
    toolSlug: clean(env.ACCESS_LAYER_TOOL_SLUG) ?? "redash-ingestor",
    clientId: clean(env.ACCESS_LAYER_CLIENT_ID),
    clientSecret: clean(env.ACCESS_LAYER_CLIENT_SECRET),
    sessionSecret: clean(env.REDASH_INGESTOR_SESSION_SECRET)
  };

  if (config.mode === "access-layer") {
    const missing = [
      ["ACCESS_LAYER_PUBLIC_BASE_URL", config.publicBaseUrl],
      ["ACCESS_LAYER_INTERNAL_BASE_URL", config.internalBaseUrl],
      ["ACCESS_LAYER_CALLBACK_URL", config.callbackUrl],
      ["ACCESS_LAYER_CLIENT_ID", config.clientId],
      ["ACCESS_LAYER_CLIENT_SECRET", config.clientSecret],
      ["REDASH_INGESTOR_SESSION_SECRET", config.sessionSecret]
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Redash Ingestor Access Layer auth is enabled but missing configuration: ${missing.join(", ")}.`);
    }
  }

  return config;
}

export function getLocalDevelopmentIdentity() {
  return DEV_IDENTITY;
}

export function hasRedashIngestorPermission(
  identity: RedashIngestorAuthIdentity,
  permission: RedashIngestorPermission
) {
  return identity.permissions.includes(permission) || identity.permissions.includes(REDASH_INGESTOR_PERMISSIONS.admin);
}

export function createAuthState() {
  return randomBytes(24).toString("base64url");
}

export function isValidAuthCallbackState(actual: string | null, expected: string | undefined) {
  return Boolean(actual && expected && actual === expected);
}

export function toAccessLayerIdentity(payload: AccessLayerExchangeResponse): RedashIngestorAuthIdentity {
  return {
    user: {
      email: payload.user.email,
      displayName: payload.user.display_name ?? null
    },
    googleSub: payload.user.google_sub,
    email: payload.user.email,
    permissions: payload.grant.permissions,
    role: payload.grant.role,
    accessSessionId: payload.session.id,
    correlationId: payload.correlation_id
  };
}

export function joinAccessLayerUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function getRedashIngestorPublicRedirectUrl(
  path: string,
  requestUrl: string,
  config: Pick<RedashIngestorAuthConfig, "callbackUrl">
) {
  return new URL(path, config.callbackUrl ?? requestUrl);
}

export function signRedashIngestorSession(identity: RedashIngestorAuthIdentity, secret: string) {
  const payload = Buffer.from(JSON.stringify(identity), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyRedashIngestorSession(value: string | undefined, secret: string) {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RedashIngestorAuthIdentity;
    if (
      !parsed ||
      typeof parsed.email !== "string" ||
      typeof parsed.googleSub !== "string" ||
      !Array.isArray(parsed.permissions) ||
      typeof parsed.role !== "string" ||
      typeof parsed.accessSessionId !== "string" ||
      typeof parsed.correlationId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
