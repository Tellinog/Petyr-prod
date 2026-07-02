import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PETYR_AUTH_SESSION_COOKIE = "petyr_auth_session";
export const PETYR_AUTH_STATE_COOKIE = "petyr_auth_state";

export const PETYR_PERMISSIONS = {
  read: "petyr:read",
  forecastWrite: "petyr:forecast:write",
  managementWrite: "petyr:management:write",
  admin: "petyr:admin",
  redashOperator: "petyr:redash:operator"
} as const;

export const ALL_PETYR_PERMISSIONS = Object.values(PETYR_PERMISSIONS);

export type PetyrPermission = (typeof PETYR_PERMISSIONS)[keyof typeof PETYR_PERMISSIONS];

export type PetyrAuthMode = "disabled" | "access-layer";

export type PetyrAuthConfig = {
  mode: PetyrAuthMode;
  publicBaseUrl: string | null;
  internalBaseUrl: string | null;
  callbackUrl: string | null;
  toolSlug: string;
  clientId: string | null;
  clientSecret: string | null;
  sessionSecret: string | null;
};

export type PetyrAuthIdentity = {
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
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  session: {
    id: string;
    issued_at?: string;
    expires_at?: string;
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

const DEV_IDENTITY: PetyrAuthIdentity = {
  user: {
    email: "dev.petyr@local",
    displayName: "Local Petyr Developer"
  },
  googleSub: "local-dev-petyr",
  email: "dev.petyr@local",
  permissions: ALL_PETYR_PERMISSIONS,
  role: "local_developer",
  accessSessionId: "local-dev-session",
  correlationId: "local-dev-correlation"
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readPetyrAuthConfig(env: NodeJS.ProcessEnv = process.env): PetyrAuthConfig {
  const explicitMode = clean(env.PETYR_AUTH_MODE);
  const nodeEnv = clean(env.NODE_ENV) ?? "development";

  if (explicitMode && explicitMode !== "disabled" && explicitMode !== "access-layer") {
    throw new Error("PETYR_AUTH_MODE must be either disabled or access-layer.");
  }

  if (nodeEnv === "production" && explicitMode === "disabled") {
    throw new Error("PETYR_AUTH_MODE=disabled is not allowed when NODE_ENV=production.");
  }

  const mode: PetyrAuthMode =
    explicitMode === "disabled" || explicitMode === "access-layer"
      ? explicitMode
      : nodeEnv === "development"
        ? "disabled"
        : "access-layer";

  const config: PetyrAuthConfig = {
    mode,
    publicBaseUrl: clean(env.ACCESS_LAYER_PUBLIC_BASE_URL) ?? clean(env.ACCESS_LAYER_BASE_URL),
    internalBaseUrl: clean(env.ACCESS_LAYER_INTERNAL_BASE_URL) ?? clean(env.ACCESS_LAYER_BASE_URL),
    callbackUrl: clean(env.ACCESS_LAYER_CALLBACK_URL),
    toolSlug: clean(env.ACCESS_LAYER_TOOL_SLUG) ?? "petyr",
    clientId: clean(env.ACCESS_LAYER_CLIENT_ID),
    clientSecret: clean(env.ACCESS_LAYER_CLIENT_SECRET),
    sessionSecret: clean(env.PETYR_SESSION_SECRET)
  };

  if (config.mode === "access-layer") {
    const missing = [
      ["ACCESS_LAYER_PUBLIC_BASE_URL", config.publicBaseUrl],
      ["ACCESS_LAYER_INTERNAL_BASE_URL", config.internalBaseUrl],
      ["ACCESS_LAYER_CALLBACK_URL", config.callbackUrl],
      ["ACCESS_LAYER_CLIENT_ID", config.clientId],
      ["ACCESS_LAYER_CLIENT_SECRET", config.clientSecret],
      ["PETYR_SESSION_SECRET", config.sessionSecret]
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Petyr Access Layer auth is enabled but missing configuration: ${missing.join(", ")}.`);
    }
  }

  return config;
}

export function getLocalDevelopmentIdentity() {
  return DEV_IDENTITY;
}

export function hasPetyrPermission(identity: PetyrAuthIdentity, permission: PetyrPermission) {
  return identity.permissions.includes(permission);
}

export function hasUsablePetyrGrant(identity: PetyrAuthIdentity) {
  return hasPetyrPermission(identity, PETYR_PERMISSIONS.read);
}

export function requirePetyrPermissionValue(identity: PetyrAuthIdentity, permission: PetyrPermission) {
  if (!hasPetyrPermission(identity, permission)) {
    throw new Error(`Petyr permission denied: ${permission}.`);
  }
}

export function createAuthState() {
  return randomBytes(24).toString("base64url");
}

export function isValidAuthCallbackState(actual: string | null, expected: string | undefined) {
  return Boolean(actual && expected && actual === expected);
}

export function toAccessLayerIdentity(payload: AccessLayerExchangeResponse): PetyrAuthIdentity {
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

export function getPetyrPublicRedirectUrl(
  path: string,
  requestUrl: string,
  config: Pick<PetyrAuthConfig, "callbackUrl">
) {
  return new URL(path, config.callbackUrl ?? requestUrl);
}

export function signPetyrSession(identity: PetyrAuthIdentity, secret: string) {
  const payload = Buffer.from(JSON.stringify(identity), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPetyrSession(value: string | undefined, secret: string): PetyrAuthIdentity | null {
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
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PetyrAuthIdentity;
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
